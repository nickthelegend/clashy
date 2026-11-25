// Checks MagicBlock TEE authentication: gets a token for a throwaway key and prints its lifetime.
//   npx tsx scripts/tee-token.ts [url]
import { getAuthToken } from '@magicblock-labs/ephemeral-rollups-sdk';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
const url = process.argv[2] ?? 'https://devnet-tee.magicblock.app';
const kp = Keypair.generate();
const t = await getAuthToken(url, kp.publicKey, async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey));
console.log('token length', t.token.length, '· expires in', Math.round((t.expiresAt - Date.now()) / 60000), 'min · raw expiresAt', t.expiresAt);
const r = await fetch(`${url}?token=${t.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }) });
console.log('getSlot with the token:', r.status);
