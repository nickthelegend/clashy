// Writes the local fork's USDC mint account: mainnet USDC's address (EPjF…Dt1v), 6 decimals, with the local admin key
// as mint authority so tests and the local faucet can mint test USDC. solana-test-validator loads it with --account.
// It is a local stand-in only: on devnet/mainnet the app uses the real mint and players bring their own USDC.
//
//   npx tsx scripts/usdc-mint.ts <out.json>
import { PublicKey } from '@solana/web3.js';
import { MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync, writeFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const out = process.argv[2];
if (!out) throw new Error('usage: usdc-mint.ts <out.json>');
// only the public key of the local admin is used (the file is read, never printed)
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL('../.keys/local-authority.json', import.meta.url), 'utf8')))).publicKey;

const data = Buffer.alloc(MINT_SIZE); // 82 bytes
data.writeUInt32LE(1, 0); // mint authority: Some
admin.toBuffer().copy(data, 4);
data.writeBigUInt64LE(0n, 36); // supply
data.writeUInt8(6, 44); // decimals
data.writeUInt8(1, 45); // initialized
data.writeUInt32LE(0, 46); // freeze authority: None
writeFileSync(out, JSON.stringify({
  pubkey: USDC,
  account: { lamports: 1_461_600, data: [data.toString('base64'), 'base64'], owner: TOKEN_PROGRAM_ID.toBase58(), executable: false, rentEpoch: 0, space: MINT_SIZE },
}));
console.log(`local USDC mint ${new PublicKey(USDC).toBase58().slice(0, 6)}… (6 decimals, local mint authority) → ${out}`);
