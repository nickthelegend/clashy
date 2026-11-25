// Audit M-H2: money can't get stuck on the rollup. A duel goes live, then nobody checks it (as if every phone closed and
// the keeper were down). void_duel is refused before the bell + VOID_GRACE_SECS, then anyone voids it: it returns to
// Solana as a draw and settle_duel refunds both stakes in full, with no rake. Takes about three minutes (a 30 s duel
// plus the two-minute grace). Stop the keeper (docker compose stop crank) first, or it will finish the duel itself.
//   npx tsx --test tests/void.test.ts
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  BN, Keypair, P, USDC, USDC_MINT, authority, baseProgram, ensureSetup, er, LOCAL_ER_VALIDATOR, programFor, randomSeed, runCrank,
  sendEr, settledByAction, sha256, sleep, sponsor, sponsorProgram, tokenBalance, until, usdcAta, usdcOf, usdcPlayer, waitHome, rollDuel } from './common.ts';

const STAKE = 5 * USDC;
const GRACE = 120;
const pay = { payer: sponsor.publicKey };
let crank: ReturnType<typeof runCrank>;
let treasury: import('@solana/web3.js').PublicKey;
before(async () => { treasury = (await ensureSetup(authority.publicKey)).treasury; crank = runCrank(); });
after(async () => { await crank?.stop(); });

async function newPlayer() {
  const kp = await usdcPlayer(100 * USDC);
  await programFor(kp).methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  const name = `t_${kp.publicKey.toBase58().slice(0, 10).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  await programFor(kp).methods.createProfile(name, 0).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(name) }).rpc();
  return kp;
}

test('a live duel nobody finishes is voided after the grace and refunds both stakes, no rake', { timeout: 420_000 }, async () => {
  const [a, b] = [await newPlayer(), await newPlayer()];
  const nonce = Date.now();
  const duel = P.duel(a.publicKey, nonce);
  const vault = P.vault(duel);
  const [seedA, seedB] = [randomSeed(), randomSeed()];
  await programFor(a).methods.openDuel(new BN(nonce), new BN(STAKE), 0b111, 30, new BN(600), [...sha256(seedA)])
    .accountsPartial({ creator: a.publicKey, ...pay, duel, vault, creatorUsdc: usdcAta(a.publicKey), usdcMint: USDC_MINT }).rpc();
  await programFor(b).methods.joinDuel([...sha256(seedB)]).accountsPartial({ joiner: b.publicKey, duel, vault, joinerUsdc: usdcAta(b.publicKey) }).rpc();
  await rollDuel(duel, a, b, seedA, seedB, (k) => programFor(k));
  const [saltA, saltB] = [randomSeed(), randomSeed()];
  const commit = (p: Keypair, side: number, lev: number, salt: Buffer) =>
    [...sha256(duel.toBuffer(), p.publicKey.toBuffer(), Buffer.from([side]), Buffer.from(new Uint16Array([lev]).buffer), salt)];
  await programFor(a).methods.commitPick(commit(a, 1, 10, saltA)).accountsPartial({ signer: a.publicKey, duel }).rpc();
  await programFor(b).methods.commitPick(commit(b, 2, 10, saltB)).accountsPartial({ signer: b.publicKey, duel }).rpc();
  await programFor(a).methods.revealPick(1, 10, [...saltA]).accountsPartial({ signer: a.publicKey, duel }).rpc();
  await programFor(b).methods.revealPick(2, 10, [...saltB]).accountsPartial({ signer: b.publicKey, duel }).rpc();
  await programFor(a).methods.delegateDuel(a.publicKey, new BN(nonce)).accountsPartial({ player: a.publicKey, ...pay, duel })
    .remainingAccounts([{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }]).rpc();
  await until('duel on the rollup', 30_000, () => er.getAccountInfo(duel));
  const d0 = await baseProgram.account.duel.fetch(duel).catch(() => null);
  const erA = programFor(a, true);
  await sendEr(erA.methods.startDuel().accountsPartial({ signer: a.publicKey, duel, price: P.feed(d0?.coin ?? 0) }), a);
  const live = erA.coder.accounts.decode('duel', (await er.getAccountInfo(duel))!.data);
  assert.equal(live.status, 3, 'live on the rollup');

  // too early: before the bell + grace nobody can void it
  await assert.rejects(sendEr(erA.methods.voidDuel().accountsPartial({ payer: sponsor.publicKey, duel })), /NotExpired|0x17|custom program error/, 'no void before the grace');

  // nobody checks it; wait out the bell and the grace
  const until_ = Number(live.startTs) + live.lenSecs + GRACE + 3;
  while (Date.now() / 1000 < until_) await sleep(5000);
  const [ca, cb, ct] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
  // anyone voids it (here the sponsor alone signs: void_duel is permissionless)
  await sendEr(erA.methods.voidDuel().accountsPartial({ payer: sponsor.publicKey, duel }));
  await waitHome(duel);
  const d = await baseProgram.account.duel.fetch(duel);
  assert.ok(d.status === 4 || d.status === 5, 'finished and back on Solana');
  assert.equal(d.winner, 0, 'a void is a draw');
  const by = await settledByAction(duel, 'duel', () => sponsorProgram.methods.settleDuel().accountsPartial({ duel, vault, creatorUsdc: usdcAta(a.publicKey), joinerUsdc: usdcAta(b.publicKey), creatorPlayer: P.player(a.publicKey), joinerPlayer: P.player(b.publicKey), treasury, rentPayer: sponsor.publicKey }).rpc());
  console.log(`  void refunded ${by}`);
  const [na, nb, nt] = await Promise.all([usdcOf(a.publicKey), usdcOf(b.publicKey), tokenBalance(treasury)]);
  assert.equal(na - ca, STAKE, 'creator refunded in full');
  assert.equal(nb - cb, STAKE, 'joiner refunded in full');
  assert.equal(nt, ct, 'no rake on a void');
});
