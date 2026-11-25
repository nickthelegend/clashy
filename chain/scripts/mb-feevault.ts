// Prints the MagicBlock magic fee vault PDA of a rollup validator and whether it exists on Solana and on the rollup.
//   npx tsx scripts/mb-feevault.ts <validator> [baseUrl] [erUrl]
import { Connection, PublicKey } from '@solana/web3.js';
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const v = new PublicKey(process.argv[2]);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('magic-fee-vault'), v.toBuffer()], DELEGATION);
const base = new Connection(process.argv[3] ?? 'http://127.0.0.1:8999');
const er = new Connection(process.argv[4] ?? 'http://127.0.0.1:7799');
const [b, e] = await Promise.all([base.getAccountInfo(vault).catch(() => null), er.getAccountInfo(vault).catch(() => null)]);
console.log('fee vault', vault.toBase58(), '| base:', b ? `${b.owner.toBase58().slice(0, 6)} ${b.lamports}` : 'none', '| rollup:', e ? `${e.owner.toBase58().slice(0, 6)} ${e.lamports}` : 'none');
