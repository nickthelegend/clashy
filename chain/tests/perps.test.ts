// Perps clashes on the local MagicBlock stack: leverage is sealed with the call, recorded at reveal, applied to
// the live P&L on the rollup, and a side that loses 100% of its stake is knocked out (liquidated) and loses.
// Real program, real rollup, live Coinbase prices, USDC stakes; players hold no SOL.
// Run: bash scripts/localnet.sh && npx tsx --test --test-concurrency=1 tests/perps.test.ts
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  BN, COINS, Keypair, P, PublicKey, USDC, USDC_MINT, authority, baseProgram, ensureSetup, er, erProgram, lamports, LOCAL_ER_VALIDATOR,
  crank as crankKey, programFor, randomSeed, runCrank, sendEr, settledByAction, sha256, sleep, sponsor, sponsorProgram, tokenBalance, until, usdcAta, usdcOf, usdcPlayer, waitHome, rollDuel } from './common.ts';

const STAKE = 5 * USDC;
const BPS = 10_000n;
const validatorMeta = [{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }];
const pay = { payer: sponsor.publicKey };
let treasury: PublicKey;
let rakeBps = 0;
let crank: ReturnType<typeof runCrank>;

before(async () => {
  const cfg = await ensureSetup(authority.publicKey);
  treasury = cfg.treasury;
  rakeBps = cfg.rakeBps;
  // live prices on the rollup: reuse the stack's crank if one is already pushing, else run one for this test
  const at = async () => (await erProgram.account.priceFeed.fetch(P.feed(0))).updatedAt.toNumber();
  const t0 = await at();
  await sleep(2500);
  if ((await at()) === t0) crank = runCrank();
});
after(async () => { await crank?.stop(); });

async function newPlayer(usdc = 100 * USDC) {
  const kp = await usdcPlayer(usdc);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  const name = `p_${kp.publicKey.toBase58().slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  await programFor(kp).methods.createProfile(name, 0).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(name) }).rpc();
  return kp;
}

/** The program's pnl_bps: leverage applied before the division (i128, truncating toward zero), floored at -100%. */
function expectedPnl(entry: bigint, price: bigint, dir: number, lev: number): bigint {
  const raw = ((price - entry) * BPS * BigInt(lev)) / entry;
  const signed = dir === 2 ? -raw : raw;
  return signed < -BPS ? -BPS : signed;
}

const commitOf = (duel: PublicKey, player: Keypair, side: number, lev: number, salt: Buffer) =>
  [...sha256(duel.toBuffer(), player.publicKey.toBuffer(), Buffer.from([side]), Buffer.from(new Uint16Array([lev]).buffer), salt)];

/**
 * Open → join → commit-reveal roll → sealed leveraged picks → delegate → start on the rollup.
 * The nonce is a small random number, not open-time milliseconds, so the scripted rival (friends.ts, which only
 * joins clashes opened after it came online) never races this test's joiner.
 */
async function liveDuel(lenSecs: number, picks: [{ side: number; lev: number }, { side: number; lev: number }]) {
  const a = await newPlayer();
  const b = await newPlayer();
  const nonce = 1 + Math.floor(Math.random() * 1e9);
  const duel = P.duel(a.publicKey, nonce);
  const vault = P.vault(duel);
  const [seedA, seedB] = [randomSeed(), randomSeed()];
  await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, lenSecs, new BN(600), [...sha256(seedA)])
    .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
  await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
  await rollDuel(duel, a, b, seedA, seedB, (k) => programFor(k));
  let d = await baseProgram.account.duel.fetch(duel);
  assert.equal(d.status, 2, 'rolled');
  assert.ok(d.coin < 3, `a crypto coin (${COINS[d.coin].symbol})`);
  assert.deepEqual([...d.lev], [0, 0], 'no leverage is known before the picks are revealed');

  const [saltA, saltB] = [randomSeed(), randomSeed()];
  await programFor(a).methods.commitPick(commitOf(duel, a, picks[0].side, picks[0].lev, saltA)).accountsPartial({ signer: a.publicKey, duel }).rpc();
  await programFor(b).methods.commitPick(commitOf(duel, b, picks[1].side, picks[1].lev, saltB)).accountsPartial({ signer: b.publicKey, duel }).rpc();
  // the leverage is sealed with the call: revealing a different leverage is refused
  await assert.rejects(programFor(a).methods.revealPick(picks[0].side, picks[0].lev + 1, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /RevealMismatch/);
  await programFor(a).methods.revealPick(picks[0].side, picks[0].lev, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
  await programFor(b).methods.revealPick(picks[1].side, picks[1].lev, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
  d = await baseProgram.account.duel.fetch(duel);
  assert.deepEqual([...d.lev], [picks[0].lev, picks[1].lev], 'each player\'s leverage is recorded at reveal');
  assert.deepEqual([...d.side], [picks[0].side, picks[1].side]);

  await programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel }).remainingAccounts(validatorMeta).rpc();
  await until('duel on the rollup', 30_000, () => er.getAccountInfo(duel));
  const priceAcct = P.feed(d.coin);
  // balances before the clash: the settle Magic Action may pay out the moment the duel comes home
  pre.set(duel.toBase58(), await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]));
  await sendEr(programFor(a, true).methods.startDuel().accountsPartial({ signer: a.publicKey, duel, price: priceAcct }), a);
  return { a, b, duel, vault, coin: d.coin, priceAcct };
}

const readEr = async (duel: PublicKey) => erProgram.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data);

const pre = new Map<string, number[]>();

async function settle(a: Keypair, b: Keypair, duel: PublicKey, vault: PublicKey) {
  const [ca, cb, ct] = pre.get(duel.toBase58())!;
  const by = await settledByAction(duel, 'duel', () => sponsorProgram.methods.settleDuel().accountsPartial({ duel, vault, creatorUsdc: usdcAta(a.publicKey), joinerUsdc: usdcAta(b.publicKey), creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury, rentPayer: sponsor.publicKey }).rpc());
  const [na, nb, nt] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
  console.log(`  settled ${by}`);
  return { da: na - ca, db: nb - cb, dt: nt - ct };
}

describe('perps clash: leverage and liquidation', () => {
  test('25x long vs 25x short at the live price: leverage recorded, P&L is 25x the move, settles at the bell', async () => {
    const { a, b, duel, vault, priceAcct } = await liveDuel(30, [{ side: 1, lev: 25 }, { side: 2, lev: 25 }]);
    const erA = programFor(a, true);
    let checks = 0;
    for (;;) {
      await sleep(2000);
      if ((await readEr(duel)).status !== 3) break;
      await sendEr(erA.methods.checkDuel().accountsPartial({ payer: sponsor.publicKey, duel, price: priceAcct })).catch((e) => {
        if (!String(e).includes('WrongStatus')) throw e;
      });
      assert.ok(++checks < 40, 'the clash finishes within its length');
    }
    await waitHome(duel);
    const d = await baseProgram.account.duel.fetch(duel);
    assert.ok(d.status === 4 || d.status === 5, 'finished and back on Solana');
    assert.deepEqual([...d.lev], [25, 25]);
    const [entry, exit] = [BigInt(d.entryPrice.toString()), BigInt(d.exitPrice.toString())];
    assert.equal(BigInt(d.pnlBps[0].toString()), expectedPnl(entry, exit, 1, 25), 'the long side earns 25x the move');
    assert.equal(BigInt(d.pnlBps[1].toString()), expectedPnl(entry, exit, 2, 25), 'the short side earns -25x the move');
    // a 4% move against a 25x side is a knockout; anything less is not
    const ko = (expectedPnl(entry, exit, 1, 25) <= -BPS ? 1 : 0) | (expectedPnl(entry, exit, 2, 25) <= -BPS ? 2 : 0);
    assert.equal(d.ko, ko, 'knockout bits match the leveraged P&L');
    const { da, db, dt } = await settle(a, b, duel, vault);
    const rake = Math.floor((2 * STAKE * rakeBps) / 10_000);
    if (d.winner === 1) { assert.equal(da, 2 * STAKE - rake); assert.equal(db, 0); assert.equal(dt, rake); }
    else if (d.winner === 2) { assert.equal(db, 2 * STAKE - rake); assert.equal(da, 0); assert.equal(dt, rake); }
    else { assert.equal(da, STAKE); assert.equal(db, STAKE); assert.equal(dt, 0); }
    assert.equal(await lamports(a.publicKey), 0);
    assert.equal(await lamports(b.publicKey), 0);
    console.log(`  25x clash on ${COINS[d.coin].symbol}: entry ${entry} exit ${exit} pnl ${d.pnlBps.map(String)} ko ${d.ko} winner ${d.winner}`);
  });

  test('a 50x long is liquidated by a 2.5% drop and loses to a 10x short, even mid-clash; the short takes the pot', async () => {
    const { a, b, duel, vault, coin, priceAcct } = await liveDuel(600, [{ side: 1, lev: 50 }, { side: 2, lev: 10 }]);
    const live = await readEr(duel);
    assert.equal(live.status, 3, 'live on the rollup');
    const entry = BigInt(live.entryPrice.toString());
    const drop = (entry * 975n) / 1000n;
    // Force the move deterministically: one rollup transaction where the crank authority writes a 2.5% lower price,
    // the permissionless check scores both sides at it, and the authority writes the price it found back. It is all
    // one atomic transaction, so nothing else on the stack ever reads the staged price.
    const now = (await erProgram.account.priceFeed.fetch(priceAcct)).price;
    const tx = erProgram.methods.checkDuel().accountsPartial({ payer: sponsor.publicKey, duel, price: priceAcct })
      .preInstructions([await erProgram.methods.pushPrice(new BN(drop.toString())).accountsPartial({ crank: crankKey.publicKey, feed: priceAcct }).instruction()])
      .postInstructions([await erProgram.methods.pushPrice(now).accountsPartial({ crank: crankKey.publicKey, feed: priceAcct }).instruction()]);
    await sendEr(tx, crankKey);
    await waitHome(duel);
    const d = await baseProgram.account.duel.fetch(duel);
    assert.ok(d.status === 4 || d.status === 5, 'the knockout finished the clash long before its 10 minutes');
    assert.ok(d.endTs.toNumber() < d.startTs.toNumber() + 600);
    assert.deepEqual([...d.lev], [50, 10]);
    assert.equal(BigInt(d.exitPrice.toString()), drop);
    assert.equal(d.pnlBps[0].toNumber(), -10_000, 'the 50x long lost its whole stake (-125% floored at -100%)');
    assert.equal(BigInt(d.pnlBps[1].toString()), expectedPnl(entry, drop, 2, 10), 'the 10x short made 10x the drop');
    assert.equal(d.ko, 0b01, 'only the creator is knocked out');
    assert.equal(d.winner, 2, 'the liquidated side loses');
    const { da, db, dt } = await settle(a, b, duel, vault);
    const rake = Math.floor((2 * STAKE * rakeBps) / 10_000);
    assert.equal(db, 2 * STAKE - rake, 'the short takes the pot minus rake');
    assert.equal(da, 0, 'the liquidated long gets nothing back');
    assert.equal(dt, rake);
    const [pa, pb] = await Promise.all([baseProgram.account.player.fetch(P.player(a.publicKey)), baseProgram.account.player.fetch(P.player(b.publicKey))]);
    assert.ok(pb.rating > pa.rating, 'the winner gains Elo');
    console.log(`  liquidation on ${COINS[coin].symbol}: entry ${entry} → ${drop} pnl ${d.pnlBps.map(String)} ko ${d.ko} winner ${d.winner} · short +${db / USDC} USDC`);
  });

  test('leverage above the program\'s 100x cap is refused at reveal', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const nonce = 1 + Math.floor(Math.random() * 1e9);
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    const [seedA, seedB] = [randomSeed(), randomSeed()];
    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 60, new BN(600), [...sha256(seedA)])
      .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
    await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
    await rollDuel(duel, a, b, seedA, seedB, (k) => programFor(k));
    const [saltA, saltB] = [randomSeed(), randomSeed()];
    await programFor(a).methods.commitPick(commitOf(duel, a, 1, 101, saltA)).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await programFor(b).methods.commitPick(commitOf(duel, b, 2, 0, saltB)).accountsPartial({ signer: b.publicKey, duel }).rpc();
    await assert.rejects(programFor(a).methods.revealPick(1, 101, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /BadLeverage/, '101x is over the cap');
    await assert.rejects(programFor(b).methods.revealPick(2, 0, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc(), /BadLeverage/, '0x is not leverage');
  });
});
