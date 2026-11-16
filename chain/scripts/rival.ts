// A rival player for trying the app alone on the local stack: it holds only USDC (0 SOL), joins the next open duel
// someone else opens, locks a random side at 50x with a sealed pick, and reveals it when both have locked. The creator's
// device does the rest (VRF roll, rollup, checks, settlement). Local fork only.
//
//   npx tsx scripts/rival.ts            (Ctrl-C to stop)
import { randomBytes } from 'node:crypto';
import { BN, IS_LOCAL, P, USDC, baseProgram, programFor, sha256, sleep, usdcAta, usdcOf, usdcPlayer, sponsor } from '../tests/common.ts';

if (!IS_LOCAL) throw new Error('The rival bot only plays on the local fork');
const me = await usdcPlayer(100 * USDC);
const prog = programFor(me);
await prog.methods.initPlayer().accountsPartial({ owner: me.publicKey, payer: sponsor.publicKey }).rpc();
console.log(`rival ${me.publicKey.toBase58()} · ${(await usdcOf(me.publicKey)) / USDC} USDC · 0 SOL · waiting for an open duel`);

const done = new Set<string>();
for (;;) {
  try {
    const now = Date.now() / 1000;
    const open = (await baseProgram.account.duel.all()).filter((d) => d.account.status === 0 && Number(d.account.expiresAt) > now
      && !d.account.creator.equals(me.publicKey) && !done.has(d.publicKey.toBase58()));
    const target = open.sort((a, b) => Number(b.account.nonce) - Number(a.account.nonce))[0];
    if (!target) { await sleep(2000); continue; }
    const duel = target.publicKey;
    done.add(duel.toBase58());
    await prog.methods.joinDuel([...sha256(randomBytes(32))]).accountsPartial({ joiner: me.publicKey, duel, vault: P.vault(duel), joinerUsdc: usdcAta(me.publicKey) }).rpc();
    console.log(`joined ${duel.toBase58().slice(0, 8)}… for ${Number(target.account.stake) / USDC} USDC`);
    const side = Math.random() < 0.5 ? 1 : 2;
    const salt = randomBytes(32);
    let committed = false;
    for (let i = 0; i < 300; i++) {
      const d = await baseProgram.account.duel.fetch(duel).catch(() => null);
      if (!d || d.status >= 3) break; // live on the rollup (or gone): the creator's device runs it from here
      if (d.status === 2 && !committed) {
        const hash = sha256(duel.toBuffer(), me.publicKey.toBuffer(), Buffer.from([side]), Buffer.from(new Uint16Array([50]).buffer), salt);
        await prog.methods.commitPick([...hash]).accountsPartial({ signer: me.publicKey, duel }).rpc();
        committed = true;
        console.log(`  coin rolled · locked a sealed pick`);
      }
      if (d.status === 2 && committed && d.picksCommitted === 0b11 && !(d.picksRevealed & 0b10)) {
        await prog.methods.revealPick(side, 50, [...salt]).accountsPartial({ signer: me.publicKey, duel }).rpc();
        console.log(`  revealed ${side === 1 ? 'long' : 'short'} 50x`);
      }
      await sleep(1000);
    }
  } catch (e) {
    console.error(`rival: ${(e as Error).message.split('\n')[0]}`);
    await sleep(2000);
  }
}
