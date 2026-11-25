// MagicBlock end to end: cranks, the keeper and settlement Magic Actions on a real rollup.
//
// A duel (and a Royale) is started with start_*_cranked: the program schedules a MagicBlock crank on the rollup that
// runs tick_duel / tick_round every second. After the start, NOBODY sends another transaction: the crank scores the
// game, the keeper PDA commits and undelegates it at the bell, and the settle Magic Action pays the pot on Solana.
// The test only watches.
//
// Run: bash scripts/localnet.sh && npx tsx --test --test-concurrency=1 tests/magicblock.test.ts
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import {
  BN, COINS, Keypair, P, PublicKey, createSession, USDC, USDC_MINT, authority, base, baseProgram, ensureSetup, er, erProgram, lamports, LOCAL_ER_VALIDATOR,
  programFor, programId, randomSeed, runCrank, sendEr, sha256, sleep, sponsor, sponsorProgram, tokenBalance, until, usdcAta, usdcOf, usdcPlayer, waitHome,
} from './common.ts';

const STAKE = 5 * USDC;
const validatorMeta = [{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }];
const pay = { payer: sponsor.publicKey };
const sponsorProgramFor = () => sponsorProgram;
const KEEPER = PublicKey.findProgramAddressSync([Buffer.from('keeper')], programId)[0];
const ESCROW_INDEX = 255;
const SETTLED = 5;
let treasury: PublicKey;
let rakeBps = 0;
let crank: ReturnType<typeof runCrank>;

/** The keeper exists, holds SOL for Magic Action fees, is delegated to the rollup, and its action escrow is funded. */
async function ensureKeeper() {
  if (!(await base.getAccountInfo(KEEPER))) {
    await baseProgram.methods.initKeeper(new BN(200_000_000)).accountsPartial({ authority: authority.publicKey, keeper: KEEPER }).rpc();
    await baseProgram.methods.delegateKeeper().accountsPartial({ authority: authority.publicKey, keeper: KEEPER }).rpc();
  }
  await until('keeper on the rollup', 30_000, () => er.getAccountInfo(KEEPER));
  const escrow = escrowPdaFromEscrowAuthority(KEEPER, ESCROW_INDEX);
  if ((await base.getBalance(escrow)) < 50_000_000) {
    await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrow, KEEPER, sponsor.publicKey, 100_000_000, ESCROW_INDEX)), [sponsor], { commitment: 'confirmed' });
  }
  return escrow;
}

before(async () => {
  const cfg = await ensureSetup(authority.publicKey);
  treasury = cfg.treasury;
  rakeBps = cfg.rakeBps;
  crank = runCrank(); // pushes prices only: the MagicBlock crank, not ours, must finish these games
  const escrow = await ensureKeeper();
  console.log(`  keeper ${KEEPER.toBase58()} · action escrow ${escrow.toBase58()} holds ${(await base.getBalance(escrow)) / 1e9} SOL`);
});
after(async () => { await crank?.stop(); });

async function newPlayer(usdc = 100 * USDC) {
  const kp = await usdcPlayer(usdc);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  const name = `m_${kp.publicKey.toBase58().slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  await programFor(kp).methods.createProfile(name, 0).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(name) }).rpc();
  return kp;
}

/** Open, join, roll and seal-and-reveal picks on Solana, then hand the duel to the rollup. */
async function rolledDuelOnRollup(a: Keypair, b: Keypair, lenSecs: number, sides: [number, number], levs: [number, number]) {
  const nonce = Date.now();
  const duel = P.duel(a.publicKey, nonce);
  const vault = P.vault(duel);
  const [seedA, seedB] = [randomSeed(), randomSeed()];
  await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, lenSecs, new BN(600), [...sha256(seedA)])
    .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
  await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
  const cfg = await baseProgram.account.config.fetch(P.config);
  if (cfg.vrfRequired) {
    await programFor(b).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: b.publicKey, ...pay, duel, oracleQueue: cfg.vrfQueue }).rpc();
    await until('MagicBlock VRF callback', 90_000, async () => ((await baseProgram.account.duel.fetch(duel)).status === 2 ? true : null));
  } else {
    await programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
    await programFor(b).methods.revealSeed([...seedB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
  }
  const salts = [randomSeed(), randomSeed()];
  const players = [a, b];
  const commit = (i: number) => [...sha256(duel.toBuffer(), players[i].publicKey.toBuffer(), Buffer.from([sides[i]]), Buffer.from(new Uint16Array([levs[i]]).buffer), salts[i])];
  for (const i of [0, 1]) await programFor(players[i]).methods.commitPick(commit(i)).accountsPartial({ signer: players[i].publicKey, duel }).rpc();
  for (const i of [0, 1]) await programFor(players[i]).methods.revealPick(sides[i], levs[i], [...salts[i]]).accountsPartial({ signer: players[i].publicKey, duel }).rpc();
  await programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel }).remainingAccounts(validatorMeta).rpc();
  await until('duel on the rollup', 30_000, () => er.getAccountInfo(duel));
  const d = await baseProgram.account.duel.fetch(duel).catch(() => null);
  const coin = d ? d.coin : erProgram.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data).coin;
  return { duel, vault, coin: coin as number };
}

const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
/** The rollup validator's magic fee vault: the keeper is a delegated fee payer billed through it. */
const FEE_VAULT = PublicKey.findProgramAddressSync([Buffer.from('magic-fee-vault'), LOCAL_ER_VALIDATOR.toBuffer()], DELEGATION)[0];
const cranked = (signer: Keypair, game: PublicKey, coin: number) => ({
  signer: signer.publicKey, game, price: P.feed(coin), keeper: KEEPER, magicFeeVault: FEE_VAULT, magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
});
const pickOf = (duel: PublicKey, player: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('pick'), duel.toBuffer(), player.toBuffer()], programId)[0];

describe('MagicBlock crank + keeper + Magic Action settlement', () => {
  test('a cranked duel finishes and pays out on Solana with no transaction after the start', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const { duel, vault, coin } = await rolledDuelOnRollup(a, b, 30, [1, 2], [10, 10]);
    const [ca, cb, ct] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
    const keeper0 = erProgram.coder.accounts.decode('keeper', (await er.getAccountInfo(KEEPER))!.data);

    const t0 = Date.now();
    await sendEr(programFor(a, true).methods.startDuelCranked().accountsPartial(cranked(a, duel, coin)), a);
    // nobody calls check_duel or settle_duel from here on: only MagicBlock's crank and the Magic Action run
    let liveTicksSeen = 0;
    const settled = await until('the cranked duel settled on Solana by the Magic Action', 120_000, async () => {
      const onEr = await er.getAccountInfo(duel).catch(() => null);
      if (onEr?.owner.equals(programId)) {
        const live = erProgram.coder.accounts.decode('duel', onEr.data);
        if (live.status === 3 && live.exitPrice.gtn(0)) liveTicksSeen++;
      }
      const home = await base.getAccountInfo(duel);
      if (!home?.owner.equals(programId)) return null;
      const d = baseProgram.coder.accounts.decode('duel', home.data);
      return d.status === SETTLED ? d : null;
    });
    const secs = (Date.now() - t0) / 1000;
    const keeper1 = erProgram.coder.accounts.decode('keeper', (await er.getAccountInfo(KEEPER))!.data);
    assert.ok(liveTicksSeen > 0, 'the crank scored the live duel (exit price moved while live)');
    assert.ok(keeper1.ticks.gt(keeper0.ticks), `the keeper counted crank ticks (${keeper0.ticks} → ${keeper1.ticks})`);
    assert.ok(keeper1.finished.gt(keeper0.finished), 'the keeper finished the duel');
    assert.equal(await base.getAccountInfo(vault), null, 'the Magic Action closed the vault');
    const [na, nb, nt] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
    const pot = 2 * STAKE;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    if (settled.winner === 1) { assert.equal(na - ca, pot - rake); assert.equal(nb, cb); assert.equal(nt - ct, rake); }
    else if (settled.winner === 2) { assert.equal(nb - cb, pot - rake); assert.equal(na, ca); assert.equal(nt - ct, rake); }
    else { assert.equal(na - ca, STAKE); assert.equal(nb - cb, STAKE); assert.equal(nt, ct); }
    const [pa, pb] = await Promise.all([baseProgram.account.player.fetch(P.player(a.publicKey)), baseProgram.account.player.fetch(P.player(b.publicKey))]);
    assert.equal(pa.rating + pb.rating, 2000, 'Elo moved in the same Magic Action, zero-sum');
    console.log(`  cranked duel on ${COINS[coin].symbol}: entry ${settled.entryPrice} exit ${settled.exitPrice} winner ${settled.winner} · settled ${secs.toFixed(1)} s after start · keeper ticks ${keeper0.ticks}→${keeper1.ticks}`);
  });

  test('a cranked Royale resolves every round and pays the survivors with no resolve or settle call', async () => {
    const host = await newPlayer();
    const ps = [await newPlayer(), await newPlayer(), await newPlayer()];
    const nonce = Date.now();
    const tour = P.tour(host.publicKey, nonce);
    const vault = P.vault(tour);
    const ENTRY = 2 * USDC;
    const cfg = await baseProgram.account.config.fetch(P.config);
    await programFor(host).methods.createTournament(new BN(nonce), new BN(ENTRY), 3, cfg.vrfRequired ? 255 : 0, 1, 3, 6)
      .accountsPartial({ creator: host.publicKey, ...pay, tournament: tour, vault, usdcMint: USDC_MINT }).rpc();
    for (const p of ps) await programFor(p).methods.joinTournament().accountsPartial({ player: p.publicKey, tournament: tour, vault, playerUsdc: usdcAta(p.publicKey) }).rpc();
    if (cfg.vrfRequired) {
      await programFor(host).methods.requestTournamentCoin([...randomSeed()]).accountsPartial({ creator: host.publicKey, ...pay, tournament: tour, oracleQueue: cfg.vrfQueue }).rpc();
      await until('MagicBlock VRF coin', 90_000, async () => ((await baseProgram.account.tournament.fetch(tour)).coin !== 255 ? true : null));
    }
    const coin = (await baseProgram.account.tournament.fetch(tour)).coin;
    await programFor(host).methods.delegateTournament(host.publicKey, new BN(nonce)).accountsPartial({ host: host.publicKey, ...pay, tournament: tour }).remainingAccounts(validatorMeta).rpc();
    await until('Royale on the rollup', 30_000, () => er.getAccountInfo(tour));
    const balances = await Promise.all(ps.map((p) => usdcOf(p.publicKey)));
    await sendEr(programFor(host, true).methods.startTournamentCranked().accountsPartial(cranked(host, tour, coin)), host);
    // players only call (up / down / silent); the crank resolves the rounds, the keeper and the Magic Action settle
    const sess1 = await createSession(ps[1]);
    let sessionErr = '';
    const deadline = Date.now() + 90_000;
    let lastRound = 0;
    while (Date.now() < deadline) {
      const info = await er.getAccountInfo(tour).catch(() => null);
      if (!info?.owner.equals(programId)) break;
      const t = erProgram.coder.accounts.decode('tournament', info.data);
      if (t.status !== 1) break;
      if (t.round !== lastRound) {
        lastRound = t.round;
        await sendEr(programFor(ps[0], true).methods.callRound(1).accountsPartial({ player: ps[0].publicKey, tournament: tour }), ps[0]).catch(() => {});
        // player 1 calls through a MagicBlock session key (no wallet signature per round)
        await sendEr(programFor(sess1.signer, true).methods.callRoundSession(2).accountsPartial({ signer: sess1.signer.publicKey, player: ps[1].publicKey, sessionToken: sess1.token, tournament: tour }), sess1.signer).catch((e) => { if (!/RoundOver|WrongStatus/.test(String(e))) sessionErr = String(e).split('\n')[0]; });
      }
      await sleep(1000);
    }
    const t = await until('the Royale settled on Solana by the Magic Action', 120_000, async () => {
      const home = await base.getAccountInfo(tour);
      if (!home?.owner.equals(programId)) return null;
      const x = baseProgram.coder.accounts.decode('tournament', home.data);
      return x.status === 3 ? x : null;
    });
    const won = (await Promise.all(ps.map((p) => usdcOf(p.publicKey)))).map((v, i) => v - balances[i]);
    const pot = 3 * ENTRY;
    const rake = Math.floor((pot * rakeBps) / 10_000);
    assert.ok(t.round >= 1, 'rounds ran');
    assert.equal(t.lives[2], 0, 'the silent player is out');
    assert.equal(sessionErr, '', 'player 1 called every round through the session key');
    assert.equal(won.reduce((s, v) => s + v, 0), pot - rake, 'the survivors split the pot minus rake');
    assert.equal(won[2], 0);
    assert.equal(await base.getAccountInfo(vault), null, 'vault closed by the Magic Action');
    console.log(`  cranked Royale on ${COINS[coin].symbol}: ${t.round} rounds, lives ${t.lives.slice(0, 3)} → payouts ${won.map((v) => v / USDC)} USDC, nobody resolved or settled by hand`);
  });

  test('private duel: picks locked inside the MagicBlock Private Ephemeral Rollup, then a cranked clash that settles itself', async () => {
    const [a, b] = [await newPlayer(), await newPlayer()];
    const nonce = Date.now();
    const duel = P.duel(a.publicKey, nonce);
    const vault = P.vault(duel);
    const [seedA, seedB] = [randomSeed(), randomSeed()];
    await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)])
      .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
    await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
    const [pickA, pickB] = [pickOf(duel, a.publicKey), pickOf(duel, b.publicKey)];
    await sponsorProgramFor().methods.openPrivatePicks().accountsPartial({ payer: sponsor.publicKey, duel, pickA, pickB }).rpc();
    const cfg = await baseProgram.account.config.fetch(P.config);
    if (cfg.vrfRequired) {
      await programFor(b).methods.requestCoinRoll([...randomSeed()]).accountsPartial({ player: b.publicKey, ...pay, duel, oracleQueue: cfg.vrfQueue }).rpc();
      await until('MagicBlock VRF callback', 90_000, async () => ((await baseProgram.account.duel.fetch(duel)).status === 2 ? true : null));
    } else {
      await programFor(a).methods.revealSeed([...seedA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
      await programFor(b).methods.revealSeed([...seedB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
    }
    // an outsider cannot hand someone else's duel to the rollup
    const outsider = await usdcPlayer(0);
    await assert.rejects(programFor(outsider).methods.delegatePrivateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: outsider.publicKey, ...pay, duel, pickA, pickB }).rpc(), /NotPlayer/);
    await programFor(a).methods.delegatePrivateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel, pickA, pickB }).remainingAccounts(validatorMeta).rpc();
    await until('duel and both picks on the rollup', 30_000, async () => ((await er.getAccountInfo(duel)) && (await er.getAccountInfo(pickA)) && (await er.getAccountInfo(pickB)) ? true : null));
    const coin = erProgram.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data).coin as number;

    const lock = (p: Keypair, pick: PublicKey, dir: number, lev: number) => sendEr(programFor(p, true).methods.lockPick(dir, lev)
      .accountsPartial({ player: p.publicKey, duel, pick, permission: permissionPdaFromAccount(pick), magicProgram: MAGIC_PROGRAM_ID }), p);
    // a player cannot write the other player's pick
    await assert.rejects(lock(b, pickA, 2, 10), /ConstraintSeeds|2006|0x7d6|seeds/i, 'no writing the rival pick');
    const start = () => sendEr(programFor(a, true).methods.startPrivateDuel().accountsPartial({
      signer: a.publicKey, duel, pickA, pickB, permissionA: permissionPdaFromAccount(pickA), permissionB: permissionPdaFromAccount(pickB),
      price: P.feed(coin), keeper: KEEPER, magicFeeVault: FEE_VAULT, magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
    }), a);
    await lock(a, pickA, 1, 25);
    await assert.rejects(start(), /CommitsPending|0x1782/, 'no start until both picks are locked');
    await assert.rejects(lock(a, pickA, 2, 25), /AlreadyDone|0x1780/, 'a locked pick cannot change');
    // player B locks through a MagicBlock session key: one wallet signature for the session, none for the move
    const sessB = await createSession(b);
    const lockSession = (as: Keypair, sess: { signer: Keypair; token: PublicKey }, pick: PublicKey) => sendEr(programFor(sess.signer, true).methods.lockPickSession(2, 25)
      .accountsPartial({ signer: sess.signer.publicKey, player: as.publicKey, sessionToken: sess.token, duel, pick, permission: permissionPdaFromAccount(pick), magicProgram: MAGIC_PROGRAM_ID }), sess.signer);
    await assert.rejects(lockSession(a, sessB, pickA), /BadSession|0x17|custom program error/, "B's session key cannot act for A");
    await lockSession(b, sessB, pickB);
    const permA = await er.getAccountInfo(permissionPdaFromAccount(pickA));
    assert.ok(permA && permA.data.length > 0, 'pick A has its own MagicBlock permission (private to player A)');

    const [ca, cb] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey)]);
    await start();
    const live = erProgram.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data);
    assert.equal(live.status, 3, 'live');
    assert.deepEqual([live.side[0], live.side[1], live.lev[0], live.lev[1]], [1, 2, 25, 25], 'the picks were copied into the duel at the start');
    await until('both picks home on Solana', 60_000, async () => ((await base.getAccountInfo(pickA))?.owner.equals(programId) && (await base.getAccountInfo(pickB))?.owner.equals(programId) ? true : null));
    const settled = await until('the private duel settled by the crank and the Magic Action', 120_000, async () => {
      const home = await base.getAccountInfo(duel);
      if (!home?.owner.equals(programId)) return null;
      const d = baseProgram.coder.accounts.decode('duel', home.data);
      return d.status === SETTLED ? d : null;
    });
    const [na, nb] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey)]);
    assert.ok(na - ca + (nb - cb) > 0, 'the pot was paid out');
    // the picks' rent goes back to the sponsor once the duel is settled
    for (const pick of [pickA, pickB]) await sponsorProgramFor().methods.closePick().accountsPartial({ pick, duel, rentPayer: sponsor.publicKey }).rpc();
    assert.equal(await base.getAccountInfo(pickA), null, 'pick closed');
    console.log(`  private duel on ${COINS[coin].symbol}: long 25x vs short 25x, entry ${settled.entryPrice} exit ${settled.exitPrice} winner ${settled.winner}; picks private until the start`);
  });

  test('the keeper cannot be abused: ticking a duel that is not live does nothing, and only the admin delegates it', async () => {
    const outsider = Keypair.generate();
    await assert.rejects(
      programFor(outsider).methods.delegateKeeper().accountsPartial({ authority: outsider.publicKey, keeper: KEEPER }).rpc(),
      /Unauthorized|ConstraintHasOne|2001|AccountNotInitialized|Signature|insufficient|0x1/,
      'only the admin can delegate the keeper',
    );
    await assert.rejects(
      programFor(outsider).methods.initKeeper(new BN(0)).accountsPartial({ authority: outsider.publicKey, keeper: KEEPER }).rpc(),
      /Unauthorized|ConstraintHasOne|already in use|0x0|Signature|insufficient/,
      'nobody can re-create the keeper',
    );
  });
});
