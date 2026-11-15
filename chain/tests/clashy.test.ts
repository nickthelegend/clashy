// End-to-end tests on the local MagicBlock stack: real program, real rollup, live Coinbase prices.
// Run: bash scripts/localnet.sh && npx tsx --test --test-concurrency=1 tests/clashy.test.ts
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  BN, COINS, Keypair, sendEr, LAMPORTS_PER_SOL, LOCAL_ER_VALIDATOR, P, authority, base, baseProgram, pushBasePrices, ensureSetup,
  er, fundedKeypair, lamports, programFor, randomSeed, runCrank, sha256, sleep, until, waitHome,
} from './common.ts';

const STAKE = 0.1 * LAMPORTS_PER_SOL;
const validatorMeta = [{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }];
let treasury: Keypair;
let rakeBps = 0;
let crank: ReturnType<typeof runCrank>;

before(async () => {
  treasury = await fundedKeypair(1);
  const cfg = await ensureSetup(treasury.publicKey);
  // a rerun keeps the first run's treasury; use whatever the config holds
  treasury = cfg.treasury.equals(treasury.publicKey) ? treasury : ({ publicKey: cfg.treasury } as Keypair);
  rakeBps = cfg.rakeBps;
  crank = runCrank();
});
after(async () => { await crank?.stop(); });

async function newPlayer() {
  const kp = await fundedKeypair(10);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey }).rpc();
  return kp;
}

describe('knockout duel: quick match on one rolled coin', () => {
  test('open → join → roll → sealed picks → live on the ER → settle with rake and Elo', async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const nonce = Date.now();
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    const [seedA, seedB] = [randomSeed(), randomSeed()];

    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)])
      .accountsPartial({ creator: a.publicKey, duel, vault }).rpc();
    await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault }).rpc();
    assert.equal(await lamports(vault), 2 * STAKE, 'both stakes are escrowed in the vault');

    // local stack has no VRF oracle: the two-party commit-reveal roll
    await programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await programFor(b).methods.revealSeed([...seedB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
    let d = await baseProgram.account.duel.fetch(duel);
    assert.equal(d.status, 2, 'rolled');
    assert.ok(d.coin < COINS.length, `coin ${d.coin} is in the pool`);
    const expected = sha256(seedA, seedB);
    assert.deepEqual(Buffer.from(d.randomness), expected, 'randomness = sha256(seedA || seedB)');

    // sealed picks: A long 50x, B short 50x
    const [saltA, saltB] = [randomSeed(), randomSeed()];
    const commit = (side: number, lev: number, salt: Buffer) => [...sha256(Buffer.from([side]), Buffer.from(new Uint16Array([lev]).buffer), salt)];
    await programFor(a).methods.commitPick(commit(1, 50, saltA)).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await assert.rejects(programFor(a).methods.revealPick(1, 50, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /CommitsPending/, 'no reveal before both commit');
    await programFor(b).methods.commitPick(commit(2, 50, saltB)).accountsPartial({ signer: b.publicKey, duel }).rpc();
    await assert.rejects(programFor(b).methods.revealPick(1, 50, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc(), /RevealMismatch/, 'cannot change side after committing');
    await programFor(a).methods.revealPick(1, 50, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await programFor(b).methods.revealPick(2, 50, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc();

    // hand it to the rollup
    await programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ payer: a.publicKey, duel }).remainingAccounts(validatorMeta).rpc();
    await until('duel on the rollup', 30_000, () => er.getAccountInfo(duel));
    d = await baseProgram.account.duel.fetch(duel).catch(() => d);
    const priceAcct = P.feed(d.coin);

    const erA = programFor(a, true);
    const startSig = await sendEr(erA.methods.startDuel().accountsPartial({ signer: a.publicKey, duel, price: priceAcct }), a);
    assert.ok(startSig, 'start_duel landed on the rollup');
    // check every 2 s until the bell (30 s) or a knockout; the duel then commits and undelegates itself
    let checks = 0;
    for (;;) {
      await sleep(2000);
      const live = erA.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data);
      if (live.status !== 3) break;
      await sendEr(erA.methods.checkDuel().accountsPartial({ payer: a.publicKey, duel, price: priceAcct }), a).catch((e) => {
        if (!String(e).includes('WrongStatus')) throw e;
      });
      checks++;
      assert.ok(checks < 40, 'duel finishes within its length');
    }
    await waitHome(duel);
    d = await baseProgram.account.duel.fetch(duel);
    assert.equal(d.status, 4, 'finished and back on Solana');
    assert.ok(d.entryPrice.gtn(0) && d.exitPrice.gtn(0));
    assert.equal(d.pnlBps[0].toNumber() + d.pnlBps[1].toNumber(), 0, 'same coin, opposite sides, same leverage: mirrored P&L');

    const [ca, cb, ct] = await Promise.all([lamports(a.publicKey), lamports(b.publicKey), lamports(treasury.publicKey)]);
    await baseProgram.methods.settleDuel().accountsPartial({ duel, vault, creator: a.publicKey, joiner: b.publicKey, creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury: treasury.publicKey }).rpc();
    const [na, nb, nt] = await Promise.all([lamports(a.publicKey), lamports(b.publicKey), lamports(treasury.publicKey)]);
    assert.equal(await lamports(vault), 0, 'vault is emptied');
    const pot = 2 * STAKE;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    if (d.winner === 1) {
      assert.equal(na - ca, pot - rake); assert.equal(nb, cb); assert.equal(nt - ct, rake);
    } else if (d.winner === 2) {
      assert.equal(nb - cb, pot - rake); assert.equal(na, ca); assert.equal(nt - ct, rake);
    } else {
      assert.equal(na - ca, STAKE); assert.equal(nb - cb, STAKE); assert.equal(nt, ct);
    }
    const [pa, pb] = await Promise.all([baseProgram.account.player.fetch(P.player(a.publicKey)), baseProgram.account.player.fetch(P.player(b.publicKey))]);
    assert.equal(pa.rating + pb.rating, 2000, 'Elo is zero-sum');
    console.log(`  duel on ${COINS[d.coin].symbol}: entry ${d.entryPrice} exit ${d.exitPrice} pnl ${d.pnlBps.map(String)} winner ${d.winner} · ratings ${pa.rating}/${pb.rating}`);
    await assert.rejects(baseProgram.methods.settleDuel().accountsPartial({ duel, vault, creator: a.publicKey, joiner: b.publicKey, creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury: treasury.publicKey }).rpc(), /WrongStatus/, 'cannot settle twice');
  });

  test('challenge board: an unmatched challenge refunds in full, no rake; joining your own is refused', async () => {
    const a = await newPlayer();
    const nonce = Date.now();
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b1, 60, new BN(3600), [...sha256(randomSeed())]).accountsPartial({ creator: a.publicKey, duel, vault }).rpc();
    await assert.rejects(programFor(a).methods.joinDuel([...sha256(randomSeed())]).accountsPartial({ joiner: a.publicKey, duel, vault, player: P.player(a.publicKey) }).rpc(), /SelfJoin/);
    const before = await lamports(a.publicKey);
    await programFor(a).methods.cancelDuel().accountsPartial({ signer: a.publicKey, duel, vault, creator: a.publicKey }).rpc();
    assert.equal(await lamports(vault), 0);
    assert.ok((await lamports(a.publicKey)) - before >= STAKE - 10_000, 'stake returned (minus the tx fee)');
  });

  test('when VRF is required the commit-reveal roll is refused', async () => {
    const cfg = await baseProgram.account.config.fetch(P.config);
    await baseProgram.methods.updateConfig(cfg.rakeBps, true, cfg.crank, cfg.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
    try {
      const a = await newPlayer();
      const b = await newPlayer();
      const nonce = Date.now();
      const duel = P.duel(a.publicKey, nonce);
      const vault = P.vault(duel);
      const seedA = randomSeed();
      await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)]).accountsPartial({ creator: a.publicKey, duel, vault }).rpc();
      await programFor(b).methods.joinDuel([...sha256(randomSeed())]).accountsPartial({ joiner: b.publicKey, duel, vault }).rpc();
      await assert.rejects(programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc(), /VrfRequired/);
    } finally {
      await baseProgram.methods.updateConfig(cfg.rakeBps, false, cfg.crank, cfg.treasury).accountsPartial({ authority: authority.publicKey }).rpc();
    }
  });
});

describe('clans: group trading by vote, then clan vs clan', () => {
  test('chest deposits, weighted votes, captain executes and closes at the oracle price, war settles to the better return', async () => {
    const capA = await newPlayer();
    const capB = await newPlayer();
    const member = await newPlayer();
    const tag = Date.now().toString(36);
    const nameA = `flame-${tag}`;
    const nameB = `moon-${tag}`;
    const clanA = P.clan(nameA);
    const clanB = P.clan(nameB);
    await programFor(capA).methods.createClan(nameA, 2).accountsPartial({ founder: capA.publicKey, clan: clanA, chest: P.chest(clanA), member: P.member(clanA, capA.publicKey) }).rpc();
    await programFor(capB).methods.createClan(nameB, 0).accountsPartial({ founder: capB.publicKey, clan: clanB, chest: P.chest(clanB), member: P.member(clanB, capB.publicKey) }).rpc();
    await programFor(member).methods.joinClan().accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey) }).rpc();

    const dep = (kp: Keypair, clan: typeof clanA, sol: number) => programFor(kp).methods.depositChest(new BN(sol * LAMPORTS_PER_SOL)).accountsPartial({ wallet: kp.publicKey, clan, member: P.member(clan, kp.publicKey), chest: P.chest(clan) }).rpc();
    await dep(capA, clanA, 2);
    await dep(member, clanA, 1);
    await dep(capB, clanB, 2);
    assert.equal(await lamports(P.chest(clanA)), 3 * LAMPORTS_PER_SOL);

    // proposal: long SOL 5x with 50% of the chest; captain yes (2 SOL), member no (1 SOL) → passes 2:1 and holds a chest majority
    const prop = P.proposal(clanA, 0);
    await programFor(member).methods.propose(0, 1, 5, 5000, new BN(60)).accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop }).rpc();
    await programFor(capA).methods.vote(true).accountsPartial({ wallet: capA.publicKey, clan: clanA, member: P.member(clanA, capA.publicKey), proposal: prop, vote: P.vote(prop, capA.publicKey) }).rpc();
    await programFor(member).methods.vote(false).accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop, vote: P.vote(prop, member.publicKey) }).rpc();
    await assert.rejects(programFor(member).methods.vote(true).accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), proposal: prop, vote: P.vote(prop, member.publicKey) }).rpc(), 'one vote per member');
    await assert.rejects(programFor(member).methods.executeProposal().accountsPartial({ captain: member.publicKey, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.feed(0) }).rpc(), /NotCaptain/);

    // war first, so the trade lands inside the war window
    const war = P.war(clanA, clanB, 1);
    const warStake = 0.5 * LAMPORTS_PER_SOL;
    await programFor(capA).methods.declareWar(new BN(1), new BN(warStake), new BN(60)).accountsPartial({ captain: capA.publicKey, clanA, clanB, chestA: P.chest(clanA), war, vault: P.vault(war) }).rpc();
    await programFor(capB).methods.acceptWar().accountsPartial({ captain: capB.publicKey, clanA, clanB, chestB: P.chest(clanB), war, vault: P.vault(war) }).rpc();
    assert.equal(await lamports(P.vault(war)), 2 * warStake, 'both war stakes escrowed');
    await assert.rejects(programFor(member).methods.withdrawChest(new BN(1000)).accountsPartial({ wallet: member.publicKey, clan: clanA, member: P.member(clanA, member.publicKey), chest: P.chest(clanA) }).rpc(), /WarLocked/);

    await pushBasePrices(); // Solana-side copy of the live price
    // the rollup feed's stale Solana copy (owned by the delegation program) is not a valid price on Solana
    await assert.rejects(programFor(capA).methods.executeProposal().accountsPartial({ captain: capA.publicKey, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.feed(0) }).rpc(), /FeedInvalid/);
    await programFor(capA).methods.executeProposal().accountsPartial({ captain: capA.publicKey, clan: clanA, proposal: prop, position: P.position(clanA, 0), price: P.baseFeed(0) }).rpc();
    const pos = await baseProgram.account.clanPosition.fetch(P.position(clanA, 0));
    assert.equal(pos.notional.toNumber(), 1.25 * LAMPORTS_PER_SOL, '50% of the 2.5 SOL chest left after the war stake');
    await sleep(15_000);
    await pushBasePrices();
    await programFor(capA).methods.closePosition().accountsPartial({ captain: capA.publicKey, clan: clanA, position: P.position(clanA, 0), price: P.baseFeed(0) }).rpc();
    const closed = await baseProgram.account.clanPosition.fetch(P.position(clanA, 0));
    const ca = await baseProgram.account.clan.fetch(clanA);
    assert.equal(ca.scorePnl.toString(), closed.pnl.toString(), 'the clan score is the realized trade P&L');
    console.log(`  clan trade long SOL 5x: ${closed.entryPrice} → ${closed.exitPrice}, P&L ${closed.pnl} lamports of notional`);

    await until('war window over', 90_000, async () => (await baseProgram.account.war.fetch(war)).endTs.toNumber() <= Math.floor(Date.now() / 1000) - 2);
    const [chA, chB, tr] = await Promise.all([lamports(P.chest(clanA)), lamports(P.chest(clanB)), lamports(treasury.publicKey)]);
    await baseProgram.methods.settleWar().accountsPartial({ clanA, clanB, chestA: P.chest(clanA), chestB: P.chest(clanB), war, vault: P.vault(war), treasury: treasury.publicKey }).rpc();
    const w = await baseProgram.account.war.fetch(war);
    const pot = 2 * warStake;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    const [nA, nB, nT] = await Promise.all([lamports(P.chest(clanA)), lamports(P.chest(clanB)), lamports(treasury.publicKey)]);
    if (w.winner === 1) { assert.equal(nA - chA, pot - rake); assert.equal(nT - tr, rake); }
    else if (w.winner === 2) { assert.equal(nB - chB, pot - rake); assert.equal(nT - tr, rake); }
    else { assert.equal(nA - chA, warStake); assert.equal(nB - chB, warStake); }
    console.log(`  war returns ${w.returnBps.map(String)} bps → winner ${w.winner === 1 ? nameA : w.winner === 2 ? nameB : 'tie'}`);
    const after = await baseProgram.account.clan.fetch(clanA);
    assert.ok(after.war.equals(new (await import('@solana/web3.js')).PublicKey(new Uint8Array(32))), 'chest unlocked');
  });
});

describe('tournament: an on-chain Royale', () => {
  test('entries escrowed, calls and rounds on the ER, survivors split the pot', async () => {
    const host = await newPlayer();
    const ps = [await newPlayer(), await newPlayer(), await newPlayer()];
    const nonce = Date.now();
    const tour = P.tour(host.publicKey, nonce);
    const vault = P.vault(tour);
    const ENTRY = 0.05 * LAMPORTS_PER_SOL;
    await programFor(host).methods.createTournament(new BN(nonce), new BN(ENTRY), 3, 1, 1, 3, 6).accountsPartial({ creator: host.publicKey, tournament: tour, vault }).rpc();
    for (const p of ps) await programFor(p).methods.joinTournament().accountsPartial({ player: p.publicKey, tournament: tour, vault }).rpc();
    await assert.rejects(programFor(ps[0]).methods.joinTournament().accountsPartial({ player: ps[0].publicKey, tournament: tour, vault }).rpc(), /AlreadyJoined|TourFull/);
    assert.equal(await lamports(vault), 3 * ENTRY);

    await programFor(host).methods.delegateTournament(host.publicKey, new BN(nonce)).accountsPartial({ payer: host.publicKey, tournament: tour }).remainingAccounts(validatorMeta).rpc();
    await until('tournament on the rollup', 30_000, () => er.getAccountInfo(tour));
    await sendEr(programFor(host, true).methods.startTournament().accountsPartial({ signer: host.publicKey, tournament: tour, price: P.feed(1) }), host);

    // every round: player 0 calls up, player 1 calls down, player 2 stays silent (always loses a life)
    for (let round = 0; round < 3; round++) {
      const t = programFor(host, true).coder.accounts.decode('tournament', (await er.getAccountInfo(tour))!.data);
      if (t.status !== 1) break;
      await sendEr(programFor(ps[0], true).methods.callRound(1).accountsPartial({ player: ps[0].publicKey, tournament: tour }), ps[0]).catch(() => {});
      await sendEr(programFor(ps[1], true).methods.callRound(2).accountsPartial({ player: ps[1].publicKey, tournament: tour }), ps[1]).catch(() => {});
      await sleep(7000);
      await sendEr(programFor(host, true).methods.resolveRound().accountsPartial({ payer: host.publicKey, tournament: tour, price: P.feed(1) }), host);
    }
    await waitHome(tour, 90_000);
    const t = await baseProgram.account.tournament.fetch(tour);
    assert.equal(t.status, 2, 'finished and back on Solana');
    assert.equal(t.lives[2], 0, 'the silent player is out');
    const balances = await Promise.all(ps.map((p) => lamports(p.publicKey)));
    await baseProgram.methods.settleTournament().accountsPartial({ tournament: tour, vault, treasury: treasury.publicKey })
      .remainingAccounts(ps.map((p) => ({ pubkey: p.publicKey, isSigner: false, isWritable: true }))).rpc();
    const after = await Promise.all(ps.map((p) => lamports(p.publicKey)));
    const won = after.map((v, i) => v - balances[i]);
    const pot = 3 * ENTRY;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    assert.equal(won.reduce((s, v) => s + v, 0), pot - rake, 'winners split the pot minus rake');
    assert.equal(won[2], 0, 'eliminated player gets nothing');
    assert.equal(await lamports(vault), 0);
    console.log(`  royale on BTC: lives ${t.lives.slice(0, 3)} rounds ${t.round} → payouts ${won.map((v) => v / LAMPORTS_PER_SOL)} SOL`);
  });
});

void base;
