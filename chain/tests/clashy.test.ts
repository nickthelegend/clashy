// End-to-end tests on the local MagicBlock stack: real program, real rollup, live Coinbase prices, USDC stakes.
// Every player here holds USDC and not one lamport: the sponsor pays all fees and rent.
// Run: bash scripts/localnet.sh && npx tsx --test --test-concurrency=1 tests/clashy.test.ts
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  BN, COINS, Keypair, P, PublicKey, USDC, USDC_MINT, authority, base, baseProgram, ensureSetup, er, lamports, LOCAL_ER_VALIDATOR,
  programFor, pushBasePrices, randomSeed, runCrank, sendEr, settledByAction, sha256, sleep, sponsor, sponsorProgram, tokenBalance, until, usdcAta,
  usdcOf, usdcPlayer, waitHome,
} from './common.ts';

const STAKE = 5 * USDC;
const validatorMeta = [{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }];
let treasury: PublicKey; // the treasury's USDC token account
let rakeBps = 0;
let crank: ReturnType<typeof runCrank>;
const pay = { payer: sponsor.publicKey };
const noSol = async (...kps: Keypair[]) => { for (const k of kps) assert.equal(await lamports(k.publicKey), 0, 'a player never holds SOL'); };

before(async () => {
  const cfg = await ensureSetup(authority.publicKey);
  treasury = cfg.treasury;
  assert.ok(cfg.usdcMint.equals(USDC_MINT), 'stakes are USDC');
  rakeBps = cfg.rakeBps;
  crank = runCrank();
});
after(async () => { await crank?.stop(); });

async function newPlayer(usdc = 100 * USDC) {
  const kp = await usdcPlayer(usdc);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  // every stake checks the player's own limits on chain, so every player has a profile
  const name = `t_${kp.publicKey.toBase58().slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  await programFor(kp).methods.createProfile(name, 0).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(name) }).rpc();
  return kp;
}

describe('knockout duel: quick match on one rolled coin', () => {
  test('open → join → roll → sealed picks → live on the ER → settle with rake and Elo, all in USDC', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const nonce = Date.now();
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    const [seedA, seedB] = [randomSeed(), randomSeed()];

    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)])
      .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
    await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
    assert.equal(await tokenBalance(vault), 2 * STAKE, 'both USDC stakes are escrowed in the vault');
    await noSol(a, b);

    const cfg0 = await baseProgram.account.config.fetch(P.config);
    if (cfg0.vrfRequired) {
      // devnet and mainnet: MagicBlock's oracle answers the roll (the commit-reveal roll is refused there)
      await programFor(b).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: b.publicKey, ...pay, duel, oracleQueue: cfg0.vrfQueue }).rpc();
      await until('MagicBlock VRF callback', 90_000, async () => ((await baseProgram.account.duel.fetch(duel)).status === 2 ? true : null));
    } else {
      // local stack without the oracle in this test: the two-party commit-reveal roll
      await programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
      await programFor(b).methods.revealSeed([...seedB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
    }
    let d = await baseProgram.account.duel.fetch(duel);
    assert.equal(d.status, 2, 'rolled');
    assert.ok(d.coin < COINS.length, `coin ${d.coin} is in the pool`);
    if (!cfg0.vrfRequired) assert.deepEqual(Buffer.from(d.randomness), sha256(seedA, seedB), 'randomness = sha256(seedA || seedB)');

    // sealed picks: A long 50x, B short 50x
    const [saltA, saltB] = [randomSeed(), randomSeed()];
    const commit = (player: Keypair, side: number, lev: number, salt: Buffer) =>
      [...sha256(duel.toBuffer(), player.publicKey.toBuffer(), Buffer.from([side]), Buffer.from(new Uint16Array([lev]).buffer), salt)];
    await programFor(a).methods.commitPick(commit(a, 1, 50, saltA)).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await assert.rejects(programFor(a).methods.revealPick(1, 50, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /CommitsPending/, 'no reveal before both commit');
    await programFor(b).methods.commitPick(commit(b, 2, 50, saltB)).accountsPartial({ signer: b.publicKey, duel }).rpc();
    await assert.rejects(programFor(b).methods.revealPick(1, 50, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc(), /RevealMismatch/, 'cannot change side after committing');
    await programFor(a).methods.revealPick(1, 50, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await programFor(b).methods.revealPick(2, 50, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc();

    // hand it to the rollup
    const outsider = await usdcPlayer(0);
    await assert.rejects(programFor(outsider).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: outsider.publicKey, ...pay, duel }).rpc(), /NotPlayer/, 'only a player can delegate');
    await assert.rejects(sponsorProgram.methods.abortDuel().accountsPartial({ duel, vault, creatorUsdc: usdcAta(a.publicKey), joinerUsdc: usdcAta(b.publicKey), treasury, rentPayer: sponsor.publicKey }).rpc(), /NotExpired/, 'no abort inside the setup window');
    await programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel }).remainingAccounts(validatorMeta).rpc();
    await until('duel on the rollup', 30_000, () => er.getAccountInfo(duel));
    d = await baseProgram.account.duel.fetch(duel).catch(() => d);
    const priceAcct = P.feed(d.coin);

    const erA = programFor(a, true);
    const [ca, cb, ct] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
    const startSig = await sendEr(erA.methods.startDuel().accountsPartial({ signer: a.publicKey, duel, price: priceAcct }), a);
    assert.ok(startSig, 'start_duel landed on the rollup');
    // the sponsor alone runs the checks (check_duel is permissionless) until the bell or a knockout
    let checks = 0;
    for (;;) {
      await sleep(2000);
      const live = erA.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data);
      if (live.status !== 3) break;
      await sendEr(erA.methods.checkDuel().accountsPartial({ payer: sponsor.publicKey, duel, price: priceAcct })).catch((e) => {
        if (!String(e).includes('WrongStatus')) throw e;
      });
      checks++;
      assert.ok(checks < 40, 'duel finishes within its length');
    }
    await waitHome(duel);
    d = await baseProgram.account.duel.fetch(duel);
    assert.ok(d.status === 4 || d.status === 5, `finished and back on Solana (status ${d.status})`);
    assert.ok(d.entryPrice.gtn(0) && d.exitPrice.gtn(0));
    assert.equal(d.pnlBps[0].toNumber() + d.pnlBps[1].toNumber(), 0, 'same coin, opposite sides, same leverage: mirrored P&L');

    const settledBy = await settledByAction(duel, 'duel', () => sponsorProgram.methods.settleDuel().accountsPartial({ duel, vault, creatorUsdc: usdcAta(a.publicKey), joinerUsdc: usdcAta(b.publicKey), creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury, rentPayer: sponsor.publicKey }).rpc());
    d = await baseProgram.account.duel.fetch(duel);
    const [na, nb, nt] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
    assert.equal(await base.getAccountInfo(vault), null, 'the emptied vault is closed (its rent goes back to the sponsor)');
    const pot = 2 * STAKE;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    if (d.winner === 1) {
      assert.equal(na - ca, pot - rake); assert.equal(nb, cb); assert.equal(nt - ct, rake);
    } else if (d.winner === 2) {
      assert.equal(nb - cb, pot - rake); assert.equal(na, ca); assert.equal(nt - ct, rake);
    } else {
      assert.equal(na - ca, STAKE); assert.equal(nb - cb, STAKE); assert.equal(nt, ct);
    }
    await noSol(a, b);
    const [pa, pb] = await Promise.all([baseProgram.account.player.fetch(P.player(a.publicKey)), baseProgram.account.player.fetch(P.player(b.publicKey))]);
    assert.equal(pa.rating + pb.rating, 2000, 'Elo is zero-sum');
    console.log(`  duel on ${COINS[d.coin].symbol} (settled ${settledBy}): entry ${d.entryPrice} exit ${d.exitPrice} pnl ${d.pnlBps.map(String)} winner ${d.winner} · USDC ${na / USDC}/${nb / USDC} · ratings ${pa.rating}/${pb.rating}`);
    await assert.rejects(sponsorProgram.methods.settleDuel().accountsPartial({ duel, vault, creatorUsdc: usdcAta(a.publicKey), joinerUsdc: usdcAta(b.publicKey), creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury, rentPayer: sponsor.publicKey }).rpc(), /WrongStatus|AccountNotInitialized|3012/, 'cannot settle twice');
    // the settled record stays for 14 days (history, match page, weekly cup), so closing it now is refused and it stays put
    await assert.rejects(sponsorProgram.methods.closeDuel().accountsPartial({ duel, rentPayer: sponsor.publicKey }).rpc(), /NotExpired/, 'a fresh duel record is kept');
    await assert.rejects(sponsorProgram.methods.closeDuel().accountsPartial({ duel, rentPayer: a.publicKey }).rpc(), /PayoutMismatch|ConstraintAddress|2012/, 'only the rent payer gets the rent');
    assert.ok(await base.getAccountInfo(duel), 'the record is still there');
  });

  test('challenge board: an unmatched challenge refunds in full; joining your own is refused; payouts only to the right owner', async () => {
    const a = await newPlayer();
    const thief = await newPlayer();
    const nonce = Date.now();
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b1, 60, new BN(3600), [...sha256(randomSeed())]).accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
    await assert.rejects(programFor(a).methods.joinDuel([...sha256(randomSeed())]).accountsPartial({ joiner: a.publicKey, duel, vault, player: P.player(a.publicKey), joinerUsdc: usdcAta(a.publicKey) }).rpc(), /SelfJoin/);
    // an open challenge cannot be pushed into the rollup (that would lock the escrow)
    await assert.rejects(programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel }).rpc(), /WrongStatus/);
    // a stake cannot be paid from someone else's USDC account
    await assert.rejects(programFor(thief).methods.openDuel(new BN(nonce + 1), new BN(STAKE), 0b1, 60, new BN(3600), [...sha256(randomSeed())]).accountsPartial({ creator: thief.publicKey, ...pay, duel: P.duel(thief.publicKey, nonce + 1), vault: P.vault(P.duel(thief.publicKey, nonce + 1)), creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc(), /ConstraintTokenOwner|2015/);
    // the refund cannot be redirected to another wallet's USDC account
    await assert.rejects(programFor(a).methods.cancelDuel().accountsPartial({ signer: a.publicKey, duel, vault, creatorUsdc: usdcAta(thief.publicKey), rentPayer: sponsor.publicKey }).rpc(), /ConstraintTokenOwner|2015/);
    const before = await usdcOf(a.publicKey);
    await programFor(a).methods.cancelDuel().accountsPartial({ signer: a.publicKey, duel, vault, creatorUsdc: usdcAta(a.publicKey), rentPayer: sponsor.publicKey }).rpc();
    assert.equal(await base.getAccountInfo(vault), null, 'vault closed');
    assert.equal((await usdcOf(a.publicKey)) - before, STAKE, 'the full stake comes back: no fee, no rake');
    await noSol(a, thief);
  });

  test('MagicBlock VRF rolls the coin; with VRF required the commit-reveal roll and a forged callback are refused', async () => {
    const cfg = await baseProgram.account.config.fetch(P.config);
    await baseProgram.methods.updateConfig(cfg.rakeBps, true, cfg.crank, cfg.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
    try {
      const a = await newPlayer();
      const b = await newPlayer();
      const nonce = Date.now();
      const duel = P.duel(a.publicKey, nonce);
      const vault = P.vault(duel);
      const seedA = randomSeed();
      await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)]).accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
      await programFor(b).methods.joinDuel([...sha256(randomSeed())]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
      await assert.rejects(programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /VrfRequired/);

      // anyone can try to answer the callback themselves and choose the coin: the VRF identity signer stops them
      const forger = await usdcPlayer(0);
      await assert.rejects(programFor(forger).methods.coinRollCallback([...randomSeed()]).accountsPartial({ vrfProgramIdentity: forger.publicKey, duel }).rpc());
      // only a player of this duel may ask for its roll
      const queue = (await baseProgram.account.config.fetch(P.config)).vrfQueue;
      await assert.rejects(programFor(forger).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: forger.publicKey, ...pay, duel, oracleQueue: queue }).rpc(), /NotPlayer/);

      // the real roll: request randomness from MagicBlock's VRF program; MagicBlock's oracle answers the callback
      const t0 = Date.now();
      await programFor(b).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: b.publicKey, ...pay, duel, oracleQueue: queue }).rpc();
      const rolled = await until('MagicBlock VRF callback', 60_000, async () => {
        const d = await baseProgram.account.duel.fetch(duel);
        return d.status === 2 ? d : null;
      });
      assert.ok(rolled.coin < COINS.length, `VRF coin ${rolled.coin} is in the pool`);
      assert.equal(rolled.vrfPending, false);
      await noSol(a, b);
      console.log(`  VRF roll: ${COINS[rolled.coin].symbol} in ${Date.now() - t0} ms via MagicBlock's oracle on queue ${queue.toBase58().slice(0, 6)}…`);
    } finally {
      // put back what the deployment had (devnet and mainnet keep VRF required)
      await baseProgram.methods.updateConfig(cfg.rakeBps, cfg.vrfRequired, cfg.crank, cfg.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
    }
  });
});

describe('clans: group trading by vote, then clan vs clan', () => {
  test('USDC chest as shares, weighted votes, captain executes and closes at the oracle price, war settles to the better return', async () => {
    const capA = await newPlayer();
    const capB = await newPlayer();
    const member = await newPlayer();
    const tag = Date.now().toString(36);
    const nameA = `flame-${tag}`;
    const nameB = `moon-${tag}`;
    const clanA = P.clan(nameA);
    const clanB = P.clan(nameB);
    await programFor(capA).methods.createClan(nameA, 2).accountsPartial({ founder: capA.publicKey, ...pay, clan: clanA, chest: P.chest(clanA), member: P.member(clanA, capA.publicKey), usdcMint: USDC_MINT }).rpc();
    await programFor(capB).methods.createClan(nameB, 0).accountsPartial({ founder: capB.publicKey, ...pay, clan: clanB, chest: P.chest(clanB), member: P.member(clanB, capB.publicKey), usdcMint: USDC_MINT }).rpc();
    await programFor(member).methods.joinClan().accountsPartial({ wallet: member.publicKey, ...pay, clan: clanA, member: P.member(clanA, member.publicKey) }).rpc();

    const chestMove = (kp: Keypair, clan: PublicKey) => ({ wallet: kp.publicKey, clan, member: P.member(clan, kp.publicKey), chest: P.chest(clan), walletUsdc: usdcAta(kp.publicKey) });
    const dep = (kp: Keypair, clan: PublicKey, usdc: number) => programFor(kp).methods.depositChest(new BN(usdc * USDC)).accountsPartial(chestMove(kp, clan)).rpc();
    await dep(capA, clanA, 20);
    await dep(member, clanA, 10);
    await dep(capB, clanB, 20);
    assert.equal(await tokenBalance(P.chest(clanA)), 30 * USDC);

    // proposal: long SOL 5x with 50% of the chest; captain yes (20), member no (10) → passes 2:1 with over half of all shares
    const prop = P.proposal(clanA, 0);
    await programFor(member).methods.propose(0, 1, 5, 5000, new BN(60)).accountsPartial({ wallet: member.publicKey, ...pay, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop }).rpc();
    await programFor(capA).methods.vote(true).accountsPartial({ wallet: capA.publicKey, ...pay, clan: clanA, member: P.member(clanA, capA.publicKey), proposal: prop, vote: P.vote(prop, capA.publicKey) }).rpc();
    await programFor(member).methods.vote(false).accountsPartial({ wallet: member.publicKey, ...pay, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop, vote: P.vote(prop, member.publicKey) }).rpc();
    await assert.rejects(programFor(member).methods.vote(true).accountsPartial({ wallet: member.publicKey, ...pay, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop, vote: P.vote(prop, member.publicKey) }).rpc(), 'one vote per member');
    await assert.rejects(programFor(member).methods.executeProposal().accountsPartial({ captain: member.publicKey, ...pay, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.baseFeed(0), war: null }).rpc(), /NotCaptain/);

    // war first, so the trade lands inside the war window
    const war = P.war(clanA, clanB, 1);
    const warStake = 5 * USDC;
    await programFor(capA).methods.declareWar(new BN(1), new BN(warStake), new BN(60)).accountsPartial({ captain: capA.publicKey, ...pay, clanA, clanB, chestA: P.chest(clanA), war, vault: P.vault(war), usdcMint: USDC_MINT }).rpc();
    await programFor(capB).methods.acceptWar().accountsPartial({ captain: capB.publicKey, clanA, clanB, chestB: P.chest(clanB), war, vault: P.vault(war) }).rpc();
    assert.equal(await tokenBalance(P.vault(war)), 2 * warStake, 'both war stakes escrowed');
    await assert.rejects(programFor(member).methods.withdrawChest(new BN(1000)).accountsPartial(chestMove(member, clanA)).rpc(), /WarLocked/);

    await pushBasePrices(); // Solana-side copy of the live price
    // the rollup feed's stale Solana copy (owned by the delegation program) is not a valid price on Solana
    await assert.rejects(programFor(capA).methods.executeProposal().accountsPartial({ captain: capA.publicKey, ...pay, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.feed(0), war }).rpc(), /FeedMismatch|FeedInvalid/);
    await programFor(capA).methods.executeProposal().accountsPartial({ captain: capA.publicKey, ...pay, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.baseFeed(0), war }).rpc();
    // nobody can buy into a clan mid-war (its shares are mispriced while the stake is out)
    await assert.rejects(dep(member, clanA, 1), /WarLocked/);
    // the war cannot settle while a position is open, and only the captain closes before the window ends
    await assert.rejects(programFor(member).methods.closePosition().accountsPartial({ closer: member.publicKey, clan: clanA, position: P.position(clanA, 0), price: P.baseFeed(0), war }).rpc(), /NotCaptain/);
    const pos = await baseProgram.account.clanPosition.fetch(P.position(clanA, 0));
    assert.equal(pos.notional.toNumber(), 12.5 * USDC, '50% of the 25 USDC chest left after the war stake');
    await sleep(15_000);
    await pushBasePrices();
    await programFor(capA).methods.closePosition().accountsPartial({ closer: capA.publicKey, clan: clanA, position: P.position(clanA, 0), price: P.baseFeed(0), war }).rpc();
    const closed = await baseProgram.account.clanPosition.fetch(P.position(clanA, 0));
    const ca = await baseProgram.account.clan.fetch(clanA);
    assert.equal(ca.scorePnl.toString(), closed.pnl.toString(), 'the clan score is the realized trade P&L');
    console.log(`  clan trade long SOL 5x: ${closed.entryPrice} → ${closed.exitPrice}, P&L ${Number(closed.pnl) / USDC} USDC of notional`);

    await until('war window over', 90_000, async () => (await baseProgram.account.war.fetch(war)).endTs.toNumber() <= Math.floor(Date.now() / 1000) - 2);
    const [chA, chB, tr] = await Promise.all([tokenBalance(P.chest(clanA)), tokenBalance(P.chest(clanB)), tokenBalance(treasury)]);
    await sponsorProgram.methods.settleWar().accountsPartial({ clanA, clanB, chestA: P.chest(clanA), chestB: P.chest(clanB), war, vault: P.vault(war), treasury, rentPayer: sponsor.publicKey }).rpc();
    const w = await baseProgram.account.war.fetch(war);
    const pot = 2 * warStake;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    const [nA, nB, nT] = await Promise.all([tokenBalance(P.chest(clanA)), tokenBalance(P.chest(clanB)), tokenBalance(treasury)]);
    if (w.winner === 1) { assert.equal(nA - chA, pot - rake); assert.equal(nT - tr, rake); }
    else if (w.winner === 2) { assert.equal(nB - chB, pot - rake); assert.equal(nT - tr, rake); }
    else { assert.equal(nA - chA, warStake); assert.equal(nB - chB, warStake); }
    assert.equal(await base.getAccountInfo(P.vault(war)), null, 'war vault closed');
    console.log(`  war returns ${w.returnBps.map(String)} bps → winner ${w.winner === 1 ? nameA : w.winner === 2 ? nameB : 'tie'}`);
    const after = await baseProgram.account.clan.fetch(clanA);
    assert.ok(after.war.equals(PublicKey.default), 'chest unlocked');
    assert.equal(after.chest.toNumber(), await tokenBalance(P.chest(clanA)), 'the chest record matches the USDC in the chest');

    // the member cashes out all their shares: exactly their pro-rata part of the chest after the war, to the unit
    const m = await baseProgram.account.member.fetch(P.member(clanA, member.publicKey));
    const before = await usdcOf(member.publicKey);
    const expected = BigInt(after.chest.toString()) * BigInt(m.shares.toString()) / BigInt(after.shares.toString());
    await programFor(member).methods.withdrawChest(m.shares).accountsPartial(chestMove(member, clanA)).rpc();
    assert.equal(BigInt(await usdcOf(member.publicKey)) - BigInt(before), expected, 'pro-rata payout to the unit');
    assert.equal((await baseProgram.account.member.fetch(P.member(clanA, member.publicKey))).shares.toNumber(), 0);
    console.log(`  member cashed out ${m.shares} shares of ${after.shares} for ${Number(expected) / USDC} USDC of a ${after.chest.toNumber() / USDC} USDC chest`);
    // a war can stake at most half the chest
    const war2 = P.war(clanA, clanB, 2);
    const chestNow = (await baseProgram.account.clan.fetch(clanA)).chest.toNumber();
    await assert.rejects(programFor(capA).methods.declareWar(new BN(2), new BN(Math.floor(chestNow / 2) + 1), new BN(60)).accountsPartial({ captain: capA.publicKey, ...pay, clanA, clanB, chestA: P.chest(clanA), war: war2, vault: P.vault(war2), usdcMint: USDC_MINT }).rpc(), /WarStakeTooBig/);
    // the member leaves; the member account's rent goes back to the sponsor that paid it, never to the member
    await assert.rejects(programFor(member).methods.leaveClan().accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), rentPayer: member.publicKey }).rpc(), /PayoutMismatch/);
    await programFor(member).methods.leaveClan().accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), rentPayer: sponsor.publicKey }).rpc();
    await noSol(capA, capB, member);
  });
});

describe('tournament: an on-chain Royale', () => {
  test('USDC entries escrowed, calls and rounds on the ER, survivors split the pot', async () => {
    const host = await newPlayer();
    const ps = [await newPlayer(), await newPlayer(), await newPlayer()];
    const nonce = Date.now();
    const tour = P.tour(host.publicKey, nonce);
    const vault = P.vault(tour);
    const ENTRY = 2 * USDC;
    const tcfg = await baseProgram.account.config.fetch(P.config);
    // where VRF is required the coin comes from MagicBlock's oracle (255 = not chosen yet); locally the host picks BTC
    await programFor(host).methods.createTournament(new BN(nonce), new BN(ENTRY), 3, tcfg.vrfRequired ? 255 : 1, 1, 3, 6).accountsPartial({ creator: host.publicKey, ...pay, tournament: tour, vault, usdcMint: USDC_MINT }).rpc();
    const join = (p: Keypair) => programFor(p).methods.joinTournament().accountsPartial({ player: p.publicKey, tournament: tour, vault, playerUsdc: usdcAta(p.publicKey) }).rpc();
    for (const p of ps) await join(p);
    await assert.rejects(join(ps[0]), /AlreadyJoined|TourFull/);
    assert.equal(await tokenBalance(vault), 3 * ENTRY);

    if (tcfg.vrfRequired) {
      await programFor(host).methods.requestTournamentCoin([...randomSeed()]).accountsPartial({ creator: host.publicKey, ...pay, tournament: tour, oracleQueue: tcfg.vrfQueue }).rpc();
      const coin = await until('MagicBlock VRF coin for the Royale', 90_000, async () => { const t = await baseProgram.account.tournament.fetch(tour); return t.coin !== 255 ? t.coin : null; });
      console.log(`  Royale VRF coin: ${COINS[coin].symbol}`);
    }
    const tourCoin = (await baseProgram.account.tournament.fetch(tour)).coin;
    await programFor(host).methods.delegateTournament(host.publicKey, new BN(nonce)).accountsPartial({ host: host.publicKey, ...pay, tournament: tour }).remainingAccounts(validatorMeta).rpc();
    await until('tournament on the rollup', 30_000, () => er.getAccountInfo(tour));
    const balances = await Promise.all(ps.map((p) => usdcOf(p.publicKey)));
    await sendEr(programFor(host, true).methods.startTournament().accountsPartial({ signer: host.publicKey, tournament: tour, price: P.feed(tourCoin) }), host);

    // every round: player 0 calls up, player 1 calls down, player 2 stays silent (always loses a life)
    for (let round = 0; round < 3; round++) {
      const t = programFor(host, true).coder.accounts.decode('tournament', (await er.getAccountInfo(tour))!.data);
      if (t.status !== 1) break;
      await sendEr(programFor(ps[0], true).methods.callRound(1).accountsPartial({ player: ps[0].publicKey, tournament: tour }), ps[0]).catch(() => {});
      await sendEr(programFor(ps[1], true).methods.callRound(2).accountsPartial({ player: ps[1].publicKey, tournament: tour }), ps[1]).catch(() => {});
      await sleep(7000);
      await sendEr(programFor(host, true).methods.resolveRound().accountsPartial({ payer: sponsor.publicKey, tournament: tour, price: P.feed(tourCoin) }));
    }
    await waitHome(tour, 90_000);
    const t = await baseProgram.account.tournament.fetch(tour);
    assert.ok(t.status === 2 || t.status === 3, `finished and back on Solana (status ${t.status})`);
    assert.equal(t.lives[2], 0, 'the silent player is out');
    const usdcMeta = (owner: PublicKey) => ({ pubkey: usdcAta(owner), isSigner: false, isWritable: true });
    // payouts must go to each player's own USDC account, in join order (only checkable while it is still unsettled)
    if (t.status === 2) {
      await assert.rejects(sponsorProgram.methods.settleTournament().accountsPartial({ tournament: tour, vault, treasury, rentPayer: sponsor.publicKey })
        .remainingAccounts([usdcMeta(ps[0].publicKey), usdcMeta(ps[0].publicKey), usdcMeta(ps[2].publicKey)]).rpc(), /PayoutMismatch/);
    }
    const settledBy = await settledByAction(tour, 'tournament', () => sponsorProgram.methods.settleTournament().accountsPartial({ tournament: tour, vault, treasury, rentPayer: sponsor.publicKey })
      .remainingAccounts(ps.map((p) => usdcMeta(p.publicKey))).rpc());
    const won = (await Promise.all(ps.map((p) => usdcOf(p.publicKey)))).map((v, i) => v - balances[i]);
    const pot = 3 * ENTRY;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    assert.equal(won.reduce((s, v) => s + v, 0), pot - rake, 'winners split the pot minus rake');
    assert.equal(won[2], 0, 'eliminated player gets nothing');
    assert.equal(await base.getAccountInfo(vault), null, 'vault closed');
    await noSol(host, ...ps);
    console.log(`  royale (settled ${settledBy}): lives ${t.lives.slice(0, 3)} rounds ${t.round} → payouts ${won.map((v) => v / USDC)} USDC`);
  });
});
