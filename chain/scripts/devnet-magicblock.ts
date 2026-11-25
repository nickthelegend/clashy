// One-time devnet migration to the full MagicBlock stack (run after upgrading the program, with the admin key).
//
//   1. Brings every Clashy price feed, calls board and squad channel home from the old rollup (OLD_ER, a regional
//      validator 2.0 endpoint) with admin_undelegate.
//   2. Pins MagicBlock's Private Ephemeral Rollup (TEE, validator 1.1.1: built-in cranks, private accounts) and
//      re-delegates the feeds and boards there (ensureSetup). Squad channels are re-delegated by their members' apps.
//   3. Points SOL, BTC and ETH at MagicBlock's real-time pricing oracle (Pyth Lazer feeds on the rollup).
//   4. Creates the keeper PDA, funds it for Magic Action fees, delegates it to the TEE, and funds its action escrow.
// Every step checks the chain first, so running it again only does what is still missing.
//
//   source .devnet.env && CLASHY_ROLE=admin CLASHY_ER=https://devnet-tee.magicblock.app \
//     CLASHY_ER_VALIDATOR=MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo OLD_ER=https://devnet-as.magicblock.app npx tsx scripts/devnet-magicblock.ts
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Connection, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority } from '@magicblock-labs/ephemeral-rollups-sdk';
import idl from '../target/idl/clashy.json' with { type: 'json' };
import type { Clashy } from '../target/types/clashy.ts';
import { BN, IS_LOCAL, LOCAL_ER_VALIDATOR, P, PublicKey, authority, base, baseProgram, crank, ensureSetup, er, programId, sleep, sponsor, until } from '../tests/common.ts';

if (IS_LOCAL) throw new Error('devnet-magicblock.ts is for devnet; the local stack is set up by the tests');
const OLD_ER = process.env.OLD_ER;
const KEEPER = PublicKey.findProgramAddressSync([Buffer.from('keeper')], programId)[0];
const KEEPER_SOL = Number(process.env.KEEPER_SOL ?? '0.05');
const ESCROW_SOL = Number(process.env.ESCROW_SOL ?? '0.05');
/** MagicBlock's real-time pricing oracle on the rollup (Pyth Lazer ids 6, 1, 2), checked live on devnet Nov 25, 2026. */
const ORACLE_FEEDS: Record<number, { symbol: string; feed: PublicKey }> = {
  0: { symbol: 'SOL', feed: new PublicKey('ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu') },
  1: { symbol: 'BTC', feed: new PublicKey('71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr') },
  2: { symbol: 'ETH', feed: new PublicKey('5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG') },
};
const wallet = { publicKey: authority.publicKey, signTransaction: async (t: Transaction) => { t.partialSign(authority); return t; }, signAllTransactions: async (ts: Transaction[]) => ts.map((t) => { t.partialSign(authority); return t; }) };
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function sendOn(conn: Connection, tx: Transaction) {
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(authority);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await until(`confirmation of ${sig.slice(0, 8)}`, 60_000, async () => {
    const [st] = (await conn.getSignatureStatuses([sig])).value;
    if (st?.err) throw new Error(`failed: ${JSON.stringify(st.err)}`);
    return st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') ? st : null;
  });
  return sig;
}

// ---- 1. home from the old rollup
const cfg0 = await baseProgram.account.config.fetch(P.config);
log(`config: rollup validator ${cfg0.erValidator.toBase58()} · ${cfg0.coinCount} coins · vrf ${cfg0.vrfRequired ? 'required' : 'optional'}`);
if (OLD_ER && !cfg0.erValidator.equals(LOCAL_ER_VALIDATOR)) {
  const old = new Connection(OLD_ER, 'confirmed');
  const oldProgram = new Program<Clashy>(idl as Clashy, new anchor.AnchorProvider(old, wallet as unknown as anchor.Wallet, { commitment: 'confirmed' }));
  const delegated = async (k: PublicKey) => (await base.getAccountInfo(k))?.owner.equals(new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')) ?? false;
  const targets: { label: string; key: PublicKey }[] = [];
  for (let i = 0; i < cfg0.coinCount; i++) targets.push({ label: `feed ${i}`, key: P.feed(i) });
  for (const b of await oldProgram.account.board.all().catch(() => [])) targets.push({ label: `board ${b.publicKey.toBase58().slice(0, 6)}`, key: b.publicKey });
  for (const c of await oldProgram.account.channel.all().catch(() => [])) targets.push({ label: `channel ${c.publicKey.toBase58().slice(0, 6)}`, key: c.publicKey });
  for (const t of targets) {
    if (!(await delegated(t.key))) { log(`${t.label}: already home`); continue; }
    try {
      const tx = await oldProgram.methods.adminUndelegate().accountsPartial({ authority: authority.publicKey, target: t.key }).transaction();
      const sig = await sendOn(old, tx);
      log(`${t.label}: undelegate sent on the old rollup (${sig.slice(0, 10)}…)`);
    } catch (e) { log(`${t.label}: undelegate failed: ${(e as Error).message.split('\n')[0]}`); }
  }
  for (const t of targets) {
    await until(`${t.label} home on Solana`, 120_000, async () => (!(await delegated(t.key)) ? true : null)).then(() => log(`${t.label}: home`)).catch((e) => log(`${t.label}: ${(e as Error).message}`));
  }
}

// ---- 2. pin the TEE rollup and re-delegate feeds and boards there (ensureSetup is idempotent)
log(`pinning the rollup validator ${LOCAL_ER_VALIDATOR.toBase58()} (${process.env.CLASHY_ER})`);
const treasuryOwner = process.env.CLASHY_TREASURY ? new PublicKey(process.env.CLASHY_TREASURY) : (() => { throw new Error('Setup required: CLASHY_TREASURY'); })();
await ensureSetup(treasuryOwner);
log('feeds and boards are on the TEE rollup');

// ---- 3. MagicBlock's oracle for SOL, BTC and ETH
let cfg = await baseProgram.account.config.fetch(P.config);
for (const [i, o] of Object.entries(ORACLE_FEEDS)) {
  const idx = Number(i);
  if (cfg.coins[idx].feed.equals(o.feed)) { log(`${o.symbol}: already on the MagicBlock oracle`); continue; }
  const live = await er.getAccountInfo(o.feed);
  if (!live) throw new Error(`MagicBlock oracle feed ${o.feed.toBase58()} (${o.symbol}) is not on ${process.env.CLASHY_ER}`);
  const sym = Buffer.alloc(8); sym.write(o.symbol);
  await baseProgram.methods.setCoin(idx, o.feed, [...sym]).accountsPartial({ authority: authority.publicKey }).rpc();
  log(`${o.symbol}: now reads MagicBlock oracle ${o.feed.toBase58()}`);
}
cfg = await baseProgram.account.config.fetch(P.config);

// ---- 4. the keeper and its action escrow
if (!(await base.getAccountInfo(KEEPER))) {
  await baseProgram.methods.initKeeper(new BN(Math.round(KEEPER_SOL * 1e9))).accountsPartial({ authority: authority.publicKey, keeper: KEEPER }).rpc();
  log(`keeper created with ${KEEPER_SOL} SOL`);
}
if ((await base.getAccountInfo(KEEPER))!.owner.equals(programId)) {
  await baseProgram.methods.delegateKeeper().accountsPartial({ authority: authority.publicKey, keeper: KEEPER }).rpc();
  log('keeper delegated to the TEE rollup');
}
await until('keeper on the rollup', 60_000, () => er.getAccountInfo(KEEPER));
const escrow = escrowPdaFromEscrowAuthority(KEEPER, 255);
const have = await base.getBalance(escrow);
if (have < (ESCROW_SOL * 1e9) / 2) {
  await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrow, KEEPER, sponsor.publicKey, Math.round(ESCROW_SOL * 1e9), 255)), [sponsor], { commitment: 'confirmed' });
  log(`keeper action escrow ${escrow.toBase58()} topped up with ${ESCROW_SOL} SOL`);
}
await sleep(500);
log(`done · keeper ${KEEPER.toBase58()} · escrow ${(await base.getBalance(escrow)) / 1e9} SOL · crank ${crank.publicKey.toBase58().slice(0, 6)}… · coins ${cfg.coins.slice(0, cfg.coinCount).map((c) => c.feed.toBase58().slice(0, 4)).join(' ')}`);
