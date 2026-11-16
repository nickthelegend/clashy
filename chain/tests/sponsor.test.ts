// The sponsor relay pays fees and rent for players who hold only USDC. These tests check what it refuses, then send one
// real sponsored transaction through it on the local stack.
// Run: bash scripts/localnet.sh && npx tsx --test tests/sponsor.test.ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { BN, P, USDC, USDC_MINT, authority, base, baseProgram, erProgram, lamports, sponsor, until, usdcAta, usdcOf } from './common.ts';
import { server, vet } from '../scripts/sponsor.ts';

const tx = (...ixs: Parameters<Transaction['add']>) => { const t = new Transaction().add(...ixs); t.feePayer = sponsor.publicKey; return t; };
let url = '';
before(async () => {
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

describe('sponsor relay: what it will not pay for', () => {
  test('a player instruction with the sponsor as payer is accepted', async () => {
    const p = Keypair.generate();
    const ix = await baseProgram.methods.initPlayer().accountsPartial({ owner: p.publicKey, payer: sponsor.publicKey }).instruction();
    assert.deepEqual(vet(tx(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ix), 'base'), [p.publicKey.toBase58()]);
  });

  test('refuses another fee payer, admin and feed instructions, the sponsor in a player slot, the wrong layer, other programs', async () => {
    const p = Keypair.generate();
    const init = await baseProgram.methods.initPlayer().accountsPartial({ owner: p.publicKey, payer: sponsor.publicKey }).instruction();
    const notOurs = new Transaction().add(init); notOurs.feePayer = p.publicKey;
    assert.throws(() => vet(notOurs, 'base'), /fee payer/);

    const push = await baseProgram.methods.pushBasePrice(new BN(1)).accountsPartial({ crank: authority.publicKey, feed: P.baseFeed(0) }).instruction();
    assert.throws(() => vet(tx(push), 'base'), /push_base_price is not sponsored/);
    const cfg = await baseProgram.methods.updateConfig(0, false, authority.publicKey, authority.publicKey).accountsPartial({ authority: authority.publicKey }).instruction();
    assert.throws(() => vet(tx(cfg), 'base'), /update_config is not sponsored/);

    // the sponsor as the player (owner) of an account: it would be signing as a player
    const asOwner = await baseProgram.methods.initPlayer().accountsPartial({ owner: sponsor.publicKey, payer: sponsor.publicKey }).instruction();
    assert.throws(() => vet(tx(asOwner), 'base'), /sponsor cannot be init_player.owner/);

    // rollup-only instructions on Solana and the other way round
    const check = await erProgram.methods.checkDuel().accountsPartial({ payer: sponsor.publicKey, duel: P.duel(p.publicKey, 1), price: P.feed(0) }).instruction();
    assert.throws(() => vet(tx(check), 'base'), /runs on the rollup/);
    assert.throws(() => vet(tx(init), 'er'), /runs on Solana/);

    // a plain SOL transfer out of the sponsor, and a token account for some other mint
    assert.throws(() => vet(tx(SystemProgram.transfer({ fromPubkey: sponsor.publicKey, toPubkey: p.publicKey, lamports: 1 })), 'base'), /is not sponsored/);
    const otherMint = Keypair.generate().publicKey;
    const ata = createAssociatedTokenAccountIdempotentInstruction(sponsor.publicKey, getAssociatedTokenAddressSync(otherMint, p.publicKey), p.publicKey, otherMint);
    assert.throws(() => vet(tx(ata), 'base'), /only USDC token accounts/);
  });
});

describe('sponsor relay: a real sponsored transaction', () => {
  test('a wallet with zero SOL creates its player account through the relay; the faucet gives it test USDC', async () => {
    const p = Keypair.generate();
    const r0 = await fetch(`${url}/faucet`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: p.publicKey.toBase58() }) });
    assert.equal(r0.status, 200, await r0.clone().text());
    assert.equal(await usdcOf(p.publicKey), 100 * USDC);

    const t = new Transaction().add(await baseProgram.methods.initPlayer().accountsPartial({ owner: p.publicKey, payer: sponsor.publicKey }).instruction());
    t.feePayer = sponsor.publicKey;
    t.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
    // unsigned by the player: refused
    const bad = await fetch(`${url}/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx: t.serialize({ requireAllSignatures: false }).toString('base64') }) });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /signature is missing/);

    t.partialSign(p);
    const r = await fetch(`${url}/relay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx: t.serialize({ requireAllSignatures: false }).toString('base64'), layer: 'base' }) });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.ok(j.sig);
    await until('player account', 20_000, () => base.getAccountInfo(P.player(p.publicKey)));
    assert.equal(await lamports(p.publicKey), 0, 'the player still holds no SOL');
    assert.ok(usdcAta(p.publicKey) instanceof PublicKey);
    console.log(`  sponsored init_player ${j.sig.slice(0, 12)}… for a wallet holding ${(await usdcOf(p.publicKey)) / USDC} USDC and 0 SOL`);
  });
});

void USDC_MINT;
