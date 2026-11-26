// Read-only live check of Clashy on Solana devnet + MagicBlock's devnet-tee rollup: is everything a demo needs still up?
// It loads no key file, signs nothing, sends nothing, and only calls public read RPC methods.
//   npx tsx scripts/devnet-livecheck.ts
// Optional: CLASHY_BASE (default https://rpc.magicblock.app/devnet), CLASHY_ER (default https://devnet-tee.magicblock.app)
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';

const BASE = process.env.CLASHY_BASE ?? 'https://rpc.magicblock.app/devnet';
const ER = process.env.CLASHY_ER ?? 'https://devnet-tee.magicblock.app';
const TEE_VALIDATOR = 'MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const SPONSOR = new PublicKey('AjdLmw9hedd9o1ATPRRQgxQKUDRop2Lmz79krZLEP4Hz');
const KEEPER_ESCROW = new PublicKey('FxRMULTCDTT4xXbiwdacGDPtn5J9cM9jK2hqq8Jj13nE');
const USDC = new PublicKey('8Jb66CfujsctN5VuoqJWBjhQcz2G7MZAtszgAziJEXiN');
const VRF_QUEUE = new PublicKey('Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh');
const VRF_PROGRAM = 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz';
const ORACLE_PROGRAM = 'PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd';
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

const idl = JSON.parse(readFileSync(new URL('../target/idl/clashy.json', import.meta.url), 'utf8')) as Idl;
const programId = new PublicKey(idl.address);
const coder = new BorshAccountsCoder(idl);
const pda = (...s: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(s, programId)[0];
const base = new Connection(BASE, 'confirmed');
const er = new Connection(ER, 'confirmed');

type R = 'PASS' | 'WARN' | 'FAIL';
const rows: [R, string, string][] = [];
const add = (r: R, what: string, note: string) => rows.push([r, what, note]);
const sol = (l: number) => (l / LAMPORTS_PER_SOL).toFixed(4);
const ago = (unix: number) => { const s = Math.round(Date.now() / 1000 - unix); return s < 120 ? `${s} s ago` : s < 7200 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`; };
const iso = (unix: number) => new Date(unix * 1000).toISOString().replace('.000Z', 'Z');
const sym = (b: number[]) => Buffer.from(b).toString('utf8').replace(/\0+$/, '');
const step = async (what: string, f: () => Promise<void>) => { try { await f(); } catch (e) { add('FAIL', what, `error: ${(e as Error).message}`); } };

// Oracle PriceUpdateV2 (MagicBlock): disc 8 | write_authority 32 | verification enum (0 = Partial + u8, 1 = Full) | feed_id 32 | price i64 | conf u64 | expo i32 | publish_time i64
function oracle(data: Buffer) {
  let o = 8 + 32;
  o += data[o] === 0 ? 2 : 1;
  o += 32;
  const price = data.readBigInt64LE(o); o += 16;
  let expo = data.readInt32LE(o); o += 4;
  const publish = Number(data.readBigInt64LE(o));
  if (expo > 0) expo = -expo; // MagicBlock stores the exponent as +8 (= 10^-8)
  return { price: Number(price) * 10 ** expo, publish };
}

await step('Solana devnet RPC', async () => {
  const [g, v, slot] = await Promise.all([base.getGenesisHash(), base.getVersion(), base.getSlot()]);
  add(g === DEVNET_GENESIS ? 'PASS' : 'FAIL', 'Solana devnet RPC', `${BASE} · ${g === DEVNET_GENESIS ? 'devnet' : `unexpected genesis ${g}`} · solana-core ${v['solana-core']} · slot ${slot}`);
});

await step('Program', async () => {
  const p = await base.getAccountInfo(programId);
  if (!p?.executable || !p.owner.equals(UPGRADEABLE_LOADER)) return add('FAIL', 'Program', `${programId.toBase58()} is not an executable upgradeable program`);
  const dataAddr = new PublicKey(p.data.subarray(4, 36));
  const d = await base.getAccountInfo(dataAddr);
  if (!d) return add('FAIL', 'Program', 'program data account missing');
  const slot = Number(d.data.readBigUInt64LE(4));
  const auth = d.data[12] === 1 ? new PublicKey(d.data.subarray(13, 45)).toBase58() : 'none (immutable)';
  add('PASS', 'Program', `${programId.toBase58()} executable · data ${d.data.length.toLocaleString('en-US')} bytes · last deployed at slot ${slot} · upgrade authority ${auth.slice(0, 6)}…${auth.slice(-4)}`);
  const sigs = await base.getSignaturesForAddress(programId, { limit: 1 });
  if (sigs[0]?.blockTime) add('PASS', 'Last program activity (Solana)', `${iso(sigs[0].blockTime)} (${ago(sigs[0].blockTime)})`);
});

let crank: PublicKey | null = null, treasury: PublicKey | null = null;
let coins: { feed: PublicKey; symbol: string }[] = [];
await step('Config', async () => {
  const a = await base.getAccountInfo(pda(Buffer.from('config')));
  if (!a) return add('FAIL', 'Config', 'not initialised');
  const c = coder.decode('Config', a.data);
  crank = c.crank; treasury = c.treasury;
  coins = (c.coins as { feed: PublicKey; symbol: number[] }[]).slice(0, c.coin_count).map((x) => ({ feed: x.feed, symbol: sym(x.symbol) }));
  const ok = c.vrf_required && c.vrf_queue.equals(VRF_QUEUE) && c.er_validator.toBase58() === TEE_VALIDATOR && c.usdc_mint.equals(USDC);
  add(ok ? 'PASS' : 'WARN', 'Config', `rake ${c.rake_bps} bps · vrf_required ${c.vrf_required} · VRF queue ${c.vrf_queue.toBase58().slice(0, 6)}… · rollup validator ${c.er_validator.toBase58().slice(0, 6)}… · ${c.coin_count} coins: ${coins.map((x) => x.symbol).join(', ')}`);
});

await step('MagicBlock TEE rollup', async () => {
  const [v, slot, id] = await Promise.all([
    er.getVersion(),
    er.getSlot(),
    fetch(ER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getIdentity' }) }).then((r) => r.json()).catch(() => null),
  ]);
  const ident = id?.result?.identity as string | undefined;
  add(ident && ident !== TEE_VALIDATOR ? 'WARN' : 'PASS', 'MagicBlock TEE rollup', `${ER} · reads open · version ${JSON.stringify(v)} · slot ${slot}${ident ? ` · identity ${ident.slice(0, 6)}…${ident === TEE_VALIDATOR ? ' (matches config)' : ' (DIFFERENT from config)'}` : ''}`);
});

await step('Keeper', async () => {
  const k = pda(Buffer.from('keeper'));
  const onBase = await base.getAccountInfo(k);
  const delegated = !!onBase?.owner.equals(DELEGATION);
  let validator = '';
  if (delegated) {
    const rec = await base.getAccountInfo(PublicKey.findProgramAddressSync([Buffer.from('delegation'), k.toBuffer()], DELEGATION)[0]);
    if (rec) validator = new PublicKey(rec.data.subarray(8, 40)).toBase58();
  }
  const onEr = await er.getAccountInfo(k);
  const kd = onEr ? coder.decode('Keeper', onEr.data) : null;
  add(delegated && kd ? 'PASS' : 'FAIL', 'Keeper PDA', `${k.toBase58()} · ${delegated ? `delegated${validator ? ` to ${validator.slice(0, 6)}…${validator === TEE_VALIDATOR ? ' (TEE)' : ''}` : ''}` : 'NOT delegated'} · on the rollup: ${kd ? `${kd.ticks} crank ticks, ${kd.finished} games finished` : 'missing'}`);
  const esc = await base.getBalance(KEEPER_ESCROW);
  add(esc >= 0.01 * LAMPORTS_PER_SOL ? 'PASS' : 'FAIL', 'Keeper action escrow (pays Magic Actions)', `${KEEPER_ESCROW.toBase58()} · ${sol(esc)} SOL`);
});

await step('Prices', async () => {
  const now = Date.now() / 1000;
  for (const c of coins) {
    const a = await er.getAccountInfo(c.feed);
    if (!a) { add('FAIL', `Price ${c.symbol}`, `${c.feed.toBase58()} not on the rollup`); continue; }
    if (a.owner.toBase58() === ORACLE_PROGRAM) {
      const o = oracle(a.data);
      add(now - o.publish < 120 ? 'PASS' : 'FAIL', `Price ${c.symbol} (MagicBlock oracle)`, `${o.price.toFixed(2)} · published ${ago(o.publish)}`);
    } else if (a.owner.equals(programId)) {
      const f = coder.decode('PriceFeed', a.data);
      const age = now - Number(f.updated_at);
      add(age < 120 ? 'PASS' : 'WARN', `Price ${c.symbol} (Clashy crank feed)`, `${(Number(f.price) / 1e6).toFixed(2)} · updated ${ago(Number(f.updated_at))}${age >= 120 ? ' · start the price crank before a stock clash' : ''}`);
    } else add('WARN', `Price ${c.symbol}`, `owned by ${a.owner.toBase58()}`);
  }
});

await step('VRF queue', async () => {
  const q = await base.getAccountInfo(VRF_QUEUE);
  add(q?.owner.toBase58() === VRF_PROGRAM ? 'PASS' : 'FAIL', 'MagicBlock VRF queue', `${VRF_QUEUE.toBase58()} · ${q ? `owned by the VRF program, ${q.data.length} bytes` : 'missing'}`);
  const s = await base.getSignaturesForAddress(VRF_QUEUE, { limit: 1 });
  if (s[0]?.blockTime) add('PASS', 'VRF queue last activity', `${iso(s[0].blockTime)} (${ago(s[0].blockTime)})`);
});

await step('Balances', async () => {
  const sp = await base.getBalance(SPONSOR);
  add(sp >= 0.2 * LAMPORTS_PER_SOL ? 'PASS' : 'FAIL', 'Fee sponsor (relay)', `${SPONSOR.toBase58()} · ${sol(sp)} SOL`);
  if (crank) { const b = await base.getBalance(crank); add(b >= 0.05 * LAMPORTS_PER_SOL ? 'PASS' : 'FAIL', 'Price crank key', `${(crank as PublicKey).toBase58()} · ${sol(b)} SOL`); }
  if (treasury) {
    const t = await base.getParsedAccountInfo(treasury);
    const tok = (t.value?.data as { parsed?: { info?: { owner?: string; tokenAmount?: { uiAmountString?: string } } } })?.parsed?.info;
    add('PASS', 'Rake treasury (config)', `${(treasury as PublicKey).toBase58()} · ${tok?.tokenAmount ? `USDC account of ${tok.owner?.slice(0, 6)}…, ${tok.tokenAmount.uiAmountString} test USDC` : `${sol(t.value?.lamports ?? 0)} SOL`}`);
  }
  const m = await base.getTokenSupply(USDC);
  add('PASS', 'Test USDC mint', `${USDC.toBase58()} · supply ${m.value.uiAmountString} (no value, devnet only)`);
});

await step('Boards', async () => {
  const b = await er.getAccountInfo(pda(Buffer.from('board'), Buffer.from([1])));
  add(b ? 'PASS' : 'WARN', 'Calls board 1 on the rollup', b ? `${coder.decode('Board', b.data).count} posts so far` : 'not on the rollup');
});

const w = Math.max(...rows.map((r) => r[1].length));
console.log(`Clashy devnet live check · ${new Date().toISOString()}`);
for (const [r, what, note] of rows) console.log(`${r.padEnd(4)}  ${what.padEnd(w)}  ${note}`);
const fails = rows.filter((r) => r[0] === 'FAIL').length;
console.log(fails ? `${fails} FAIL` : 'no FAIL');
process.exit(fails ? 1 : 0);
