// End-to-end tests for Clashy's money journey on the local MagicBlock stack and mainnet fork:
// names, the player's own limits enforced on chain, the Stash (savings, round-ups on payments), real
// tokenized-stock buys and sells through Orca Whirlpool, the calls feed and clan chat on the rollup.
// Every player holds USDC only; the sponsor pays all fees and rent.
// Run: bash scripts/localnet.sh && npx tsx --test --test-concurrency=1 tests/brief.test.ts
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { createTransferCheckedInstruction } from '@solana/spl-token';
import { ComputeBudgetProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  BN, Keypair, P, PublicKey, TEST_BOARD, USDC, USDC_MINT, authority, base, baseProgram, ensureSetup, er, erProgram, lamports,
  programFor, randomSeed, sendEr, sha256, sponsor, tokenBalance, usdcAta, usdcOf, usdcPlayer,
} from './common.ts';
import { createStockAtaIx, minShares, minUsdc, stock, stockAta, swapAccounts } from './stocks.ts';

const pay = { payer: sponsor.publicKey };
const NONE = new BN('18446744073709551615'); // u64::MAX: not a reply
const handleOf = (kp: Keypair) => `b_${kp.publicKey.toBase58().slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

async function newProfile(usdc = 100 * USDC, name?: string) {
  const kp = await usdcPlayer(usdc);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  const n = name ?? handleOf(kp);
  await programFor(kp).methods.createProfile(n, 3).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(n) }).rpc();
  return kp;
}
const openDuel = (kp: Keypair, stake: number, nonce = Date.now()) =>
  programFor(kp).methods.openDuel(new BN(nonce), new BN(stake), 0b111, 60, new BN(600), [...sha256(randomSeed())])
    .accountsPartial({ creator: kp.publicKey, ...pay, duel: P.duel(kp.publicKey, nonce), vault: P.vault(P.duel(kp.publicKey, nonce)), creatorUsdc: usdcAta(kp.publicKey), usdcMint: USDC_MINT }).rpc();

before(async () => { await ensureSetup(authority.publicKey); });

describe('names', () => {
  test('a handle is unique and must be 3-16 lowercase letters, digits or _', async () => {
    const a = await newProfile();
    const prof = await baseProgram.account.profile.fetch(P.profile(a.publicKey));
    assert.equal(Buffer.from(prof.name).toString().replace(/\0+$/, ''), handleOf(a));
    const b = await usdcPlayer(0);
    await assert.rejects(programFor(b).methods.createProfile(handleOf(a), 1).accountsPartial({ owner: b.publicKey, ...pay, handle: P.handle(handleOf(a)) }).rpc(), /already in use|0x0/);
    await assert.rejects(programFor(b).methods.createProfile('Bad Name', 1).accountsPartial({ owner: b.publicKey, ...pay, handle: P.handle('Bad Name') }).rpc(), /BadHandle/);
    await assert.rejects(programFor(b).methods.createProfile('ab', 1).accountsPartial({ owner: b.publicKey, ...pay, handle: P.handle('ab') }).rpc(), /BadHandle/);
  });
});

describe('the player stays in control: limits checked on chain', () => {
  test('a lower daily limit applies at once and blocks a bigger stake; a raise waits a day', async () => {
    const a = await newProfile();
    await programFor(a).methods.setLimits(new BN(3 * USDC), 0, new BN(0)).accountsPartial({ owner: a.publicKey }).rpc();
    await assert.rejects(openDuel(a, 5 * USDC), /DailyLimit/, 'a 5 USDC stake is over the 3 USDC limit');
    await programFor(a).methods.setLimits(new BN(100 * USDC), 0, new BN(0)).accountsPartial({ owner: a.publicKey }).rpc();
    const p = await baseProgram.account.profile.fetch(P.profile(a.publicKey));
    assert.equal(p.dailyLimit.toNumber(), 3 * USDC, 'the raise is pending, not applied');
    assert.equal(p.pendingLimit.toNumber(), 100 * USDC);
    assert.ok(p.pendingAt.toNumber() > Date.now() / 1000 + 86_000, 'it applies a day later');
    await assert.rejects(openDuel(a, 5 * USDC), /DailyLimit/);
  });

  test('a break blocks every stake and cannot be shortened', async () => {
    const a = await newProfile();
    await programFor(a).methods.takeBreak(new BN(3600)).accountsPartial({ owner: a.publicKey }).rpc();
    await assert.rejects(openDuel(a, 5 * USDC), /OnBreak/);
    await programFor(a).methods.takeBreak(new BN(60)).accountsPartial({ owner: a.publicKey }).rpc();
    const p = await baseProgram.account.profile.fetch(P.profile(a.publicKey));
    assert.ok(p.breakUntil.toNumber() > Date.now() / 1000 + 3000, 'a shorter break does not cut the longer one');
  });

  test('stakes count toward today and the day streak', async () => {
    const a = await newProfile();
    await openDuel(a, 5 * USDC);
    const p = await baseProgram.account.profile.fetch(P.profile(a.publicKey));
    assert.equal(p.stakedToday.toNumber(), 5 * USDC);
    assert.equal(p.dayStreak, 1);
  });
});

describe('Stash: savings, round-ups, real stocks', () => {
  test('save, round up a payment in the same transaction, withdraw', async () => {
    const a = await newProfile(100 * USDC);
    const shop = await usdcPlayer(0);
    await programFor(a).methods.openStash(new BN(50 * USDC), 'New phone').accountsPartial({ owner: a.publicKey, ...pay, usdcMint: USDC_MINT }).rpc();
    const prog = programFor(a);
    await prog.methods.stashSave(new BN(10 * USDC), 0).accountsPartial({ owner: a.publicKey, ownerUsdc: usdcAta(a.publicKey) }).rpc();
    // pay a shop 4.63 USDC and round up to 5: the 0.37 goes to the Stash in the same transaction
    const roundup = 5 * USDC - 4_630_000;
    const tx = new Transaction().add(
      createTransferCheckedInstruction(usdcAta(a.publicKey), USDC_MINT, usdcAta(shop.publicKey), a.publicKey, 4_630_000, 6),
      await prog.methods.stashSave(new BN(roundup), 1).accountsPartial({ owner: a.publicKey, ownerUsdc: usdcAta(a.publicKey) }).instruction(),
    );
    tx.feePayer = sponsor.publicKey;
    await sendAndConfirmTransaction(base, tx, [sponsor, a], { commitment: 'confirmed' });
    assert.equal(await usdcOf(shop.publicKey), 4_630_000, 'the shop got paid');
    assert.equal(await tokenBalance(P.stashVault(a.publicKey)), 10 * USDC + roundup);
    await prog.methods.stashWithdraw(new BN(2 * USDC)).accountsPartial({ owner: a.publicKey, ownerUsdc: usdcAta(a.publicKey) }).rpc();
    const s = await baseProgram.account.stash.fetch(P.stash(a.publicKey));
    assert.equal(s.savedManual.toNumber(), 10 * USDC);
    assert.equal(s.savedRoundup.toNumber(), roundup);
    assert.equal(s.withdrawn.toNumber(), 2 * USDC);
    assert.equal(await usdcOf(a.publicKey), 100 * USDC - 10 * USDC - 5 * USDC + 2 * USDC);
    assert.equal(await lamports(a.publicKey), 0, 'the player never holds SOL');
    // nobody else can take it out
    const thief = await newProfile(0);
    await assert.rejects(programFor(thief).methods.stashWithdraw(new BN(1)).accountsPartial({ owner: thief.publicKey, stash: P.stash(a.publicKey), vault: P.stashVault(a.publicKey), ownerUsdc: usdcAta(thief.publicKey) }).rpc());
  });

  test('buys NVIDIA through Orca Whirlpool from the Stash, records the cost, sells half back', async () => {
    const a = await newProfile(50 * USDC);
    const nvda = stock('NVDA');
    const prog = programFor(a);
    await prog.methods.openStash(new BN(0), '').accountsPartial({ owner: a.publicKey, ...pay, usdcMint: USDC_MINT }).rpc();
    await prog.methods.stashSave(new BN(20 * USDC), 0).accountsPartial({ owner: a.publicKey, ownerUsdc: usdcAta(a.publicKey) }).rpc();
    const spend = 10n * BigInt(USDC);
    const FEE_BPS = 50n; // the program's STASH_FEE_BPS: 0.5% of every Stash trade goes to the treasury
    const fee = (spend * FEE_BPS) / 10_000n;
    const min = await minShares(base, nvda, spend - fee);
    const treasury = (await baseProgram.account.config.fetch(P.config)).treasury;
    const t0 = await tokenBalance(treasury);
    const buy = await prog.methods.stashInvest(new BN(spend.toString()), new BN(min.toString()))
      .accountsPartial({ owner: a.publicKey, ...pay, treasury, holding: P.holding(a.publicKey, new PublicKey(nvda.mint)), sw: await swapAccounts(base, a.publicKey, USDC_MINT, nvda, true) })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createStockAtaIx(sponsor.publicKey, a.publicKey, nvda)]).rpc();
    assert.ok(buy);
    const h = await baseProgram.account.holding.fetch(P.holding(a.publicKey, new PublicKey(nvda.mint)));
    const shares = await tokenBalance(stockAta(a.publicKey, nvda));
    assert.ok(shares > 0 && BigInt(shares) >= min, `got ${shares} raw NVDAx (min ${min})`);
    assert.equal(h.shares.toNumber(), shares, 'the holding matches the shares in the player\'s own account');
    assert.equal(await tokenBalance(treasury) - t0, Number(fee), 'the 0.5% protocol fee went to the treasury');
    assert.equal(h.cost.toNumber(), Number(spend - fee), 'the cost basis is what bought the stock (after the fee)');
    assert.equal(await tokenBalance(P.stashVault(a.publicKey)), 10 * USDC);

    const half = BigInt(Math.floor(shares / 2));
    const t1 = await tokenBalance(treasury);
    await prog.methods.stashSell(new BN(half.toString()), new BN(((await minUsdc(base, nvda, half)) * 99n / 100n).toString()))
      .accountsPartial({ owner: a.publicKey, ...pay, treasury, holding: P.holding(a.publicKey, new PublicKey(nvda.mint)), sw: await swapAccounts(base, a.publicKey, USDC_MINT, nvda, false) })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })]).rpc();
    const h2 = await baseProgram.account.holding.fetch(P.holding(a.publicKey, new PublicKey(nvda.mint)));
    assert.equal(h2.shares.toNumber(), shares - Number(half));
    const back = (await tokenBalance(P.stashVault(a.publicKey))) - 10 * USDC;
    assert.ok(back > 4.7 * USDC && back < 5.05 * USDC, `selling half returned ${back / USDC} USDC to the Stash`);
    assert.equal(h2.soldUsdc.toNumber(), back);
    const sellFee = (await tokenBalance(treasury)) - t1;
    assert.equal(sellFee, Math.floor(((back + sellFee) * 50) / 10_000), 'the sell paid 0.5% of its proceeds to the treasury');
    console.log(`  Stash fees: buy ${Number(fee) / USDC} USDC, sell ${sellFee / USDC} USDC → treasury`);
    assert.equal(await lamports(a.publicKey), 0);
    // someone else's shares cannot be sold through your holding
    const b = await newProfile(0);
    await assert.rejects(programFor(b).methods.stashSell(new BN(1), new BN(0))
      .accountsPartial({ owner: b.publicKey, ...pay, treasury, stash: P.stash(a.publicKey), vault: P.stashVault(a.publicKey), holding: P.holding(a.publicKey, new PublicKey(nvda.mint)), sw: await swapAccounts(base, a.publicKey, USDC_MINT, nvda, false) }).rpc());
  });
});

describe('calls feed and clan chat on the MagicBlock rollup', () => {
  test('post a call on a stock, reply, like once', async () => {
    const a = await newProfile(0);
    const b = await newProfile(0);
    const board = P.board(TEST_BOARD);
    const nvda = new PublicKey(stock('NVDA').mint);
    const before = (await erProgram.account.board.fetch(board)).count.toNumber();
    await sendEr(programFor(a, true).methods.post('Holding NVDA through earnings', 1, nvda, NONE).accountsPartial({ author: a.publicKey, board }), a);
    await sendEr(programFor(b, true).methods.post('same, added 5 USDC', 0, PublicKey.default, new BN(before)).accountsPartial({ author: b.publicKey, board }), b);
    await sendEr(programFor(b, true).methods.like(new BN(before)).accountsPartial({ liker: b.publicKey, board }), b);
    // a second, distinct transaction (another compute limit) so the rollup runs it instead of deduplicating it
    await assert.rejects(sendEr(programFor(b, true).methods.like(new BN(before)).accountsPartial({ liker: b.publicKey, board }).preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 200_001 })]), b), /AlreadyLiked|0x17b4/); // 0x17b4 = 6068 AlreadyLiked
    const bd = await erProgram.account.board.fetch(board);
    const call = bd.posts.find((p) => p.seq.toNumber() === before)!;
    assert.ok(call.author.equals(a.publicKey) && call.refkey.equals(nvda) && call.kind === 1);
    assert.equal(Buffer.from(call.text).subarray(0, call.len).toString(), 'Holding NVDA through earnings');
    assert.equal(call.likes, 1);
    assert.equal(call.replies, 1);
    const reply = bd.posts.find((p) => p.seq.toNumber() === before + 1)!;
    assert.equal(reply.replyTo.toNumber(), before);
    // posting needs a profile
    const stranger = await usdcPlayer(0);
    await assert.rejects(sendEr(programFor(stranger, true).methods.post('hi', 0, PublicKey.default, NONE).accountsPartial({ author: stranger.publicKey, board }), stranger));
  });

  test('members post in their clan channel; outsiders cannot', async () => {
    const cap = await newProfile(20 * USDC);
    const out = await newProfile(0);
    const name = `chat${Date.now() % 1_000_000}`;
    const clan = P.clan(name);
    await programFor(cap).methods.createClan(name, 1).accountsPartial({ founder: cap.publicKey, ...pay, clan, chest: P.chest(clan), member: P.member(clan, cap.publicKey), usdcMint: USDC_MINT }).rpc();
    const chan = P.channel(clan, 0);
    await programFor(cap).methods.openChannel(0).accountsPartial({ wallet: cap.publicKey, ...pay, clan, channel: chan }).rpc();
    await programFor(cap).methods.delegateChannel(clan, 0).accountsPartial({ wallet: cap.publicKey, ...pay, channel: chan })
      .remainingAccounts([{ pubkey: new PublicKey('mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev'), isSigner: false, isWritable: false }]).rpc();
    const { until } = await import('./common.ts');
    await until('channel on the rollup', 30_000, () => er.getAccountInfo(chan));
    await sendEr(programFor(cap, true).methods.postMessage('gm crew', 0, PublicKey.default).accountsPartial({ author: cap.publicKey, channel: chan, member: P.member(clan, cap.publicKey) }), cap);
    const c = await erProgram.account.channel.fetch(chan);
    assert.equal(c.count.toNumber(), 1);
    assert.equal(Buffer.from(c.msgs[0].text).subarray(0, c.msgs[0].len).toString(), 'gm crew');
    await assert.rejects(sendEr(programFor(out, true).methods.postMessage('let me in', 0, PublicKey.default).accountsPartial({ author: out.publicKey, channel: chan, member: P.member(clan, out.publicKey) }), out));
  });
});

describe('squads: a player can be in any number', () => {
  test('create one squad, join two more, leave one; the first stays the main squad', async () => {
    const a = await newProfile(30 * USDC);
    const b = await newProfile(0);
    const c = await newProfile(0);
    const tag = (Date.now() % 1_000_000).toString(36);
    const mk = async (kp: Keypair, name: string) => {
      const clan = P.clan(name);
      await programFor(kp).methods.createClan(name, 2).accountsPartial({ founder: kp.publicKey, ...pay, clan, chest: P.chest(clan), member: P.member(clan, kp.publicKey), usdcMint: USDC_MINT }).rpc();
      return clan;
    };
    const s1 = await mk(a, `sq1${tag}`);
    const s2 = await mk(b, `sq2${tag}`);
    const s3 = await mk(c, `sq3${tag}`);
    for (const clan of [s2, s3]) await programFor(a).methods.joinClan().accountsPartial({ wallet: a.publicKey, ...pay, clan, member: P.member(clan, a.publicKey) }).rpc();
    for (const clan of [s1, s2, s3]) assert.ok(await base.getAccountInfo(P.member(clan, a.publicKey)), 'a member of all three');
    assert.ok((await baseProgram.account.player.fetch(P.player(a.publicKey))).clan.equals(s1), 'the first squad is the main one');
    await programFor(a).methods.leaveClan().accountsPartial({ wallet: a.publicKey, clan: s3, member: P.member(s3, a.publicKey), rentPayer: sponsor.publicKey }).rpc();
    assert.equal(await base.getAccountInfo(P.member(s3, a.publicKey)), null, 'left the third');
    assert.ok((await baseProgram.account.player.fetch(P.player(a.publicKey))).clan.equals(s1), 'still main in the first');
    // leaving a squad you are not in is refused (no member account)
    await assert.rejects(programFor(a).methods.leaveClan().accountsPartial({ wallet: a.publicKey, clan: s3, member: P.member(s3, a.publicKey), rentPayer: sponsor.publicKey }).rpc());
  });
});
