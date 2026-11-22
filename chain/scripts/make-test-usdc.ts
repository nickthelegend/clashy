// Creates Clashy's devnet test-USDC mint (6 decimals) whose mint authority is the faucet key, paid by the admin key.
// Devnet only: players get it from the relay's faucet; the app labels it "test network, no value".
//   CLASHY_BASE=https://api.devnet.solana.com CLASHY_AUTHORITY=<admin file> CLASHY_FAUCET=<faucet file> CLASHY_ER=... \
//     CLASHY_ER_VALIDATOR=... CLASHY_CRANK=... CLASHY_SPONSOR=... npx tsx scripts/make-test-usdc.ts
import { createMint } from '@solana/spl-token';
import { IS_MAINNET, IS_LOCAL, authority, base, faucetAuthority } from '../tests/common.ts';
if (IS_MAINNET || IS_LOCAL) throw new Error('make-test-usdc runs on devnet only');
if (!faucetAuthority) throw new Error('Setup required: set CLASHY_FAUCET (the test mint authority keypair file)');
const mint = await createMint(base, authority, faucetAuthority.publicKey, null, 6, undefined, { commitment: 'confirmed' });
console.log(`test USDC mint ${mint.toBase58()} · authority ${faucetAuthority.publicKey.toBase58()}`);
