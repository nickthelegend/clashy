// Friends for playing Clashy on the local stack: real players, each with its own wallet holding only USDC (0 SOL),
// sending real transactions through the program (the sponsor pays fees and rent). Nothing here is simulated: every
// join, pick, call, deposit, vote and war is a signed transaction on the local Solana fork or the MagicBlock rollup.
//
//   Kai   joins any duel someone else opens, locks a sealed random call (up or down, at the clash's advertised
//         leverage: 1x, or a perps clash's 2x-50x), reveals.
//   Mira  keeps one open challenge on the board and runs it as creator when someone joins (VRF, rollup, checks, settle).
//   Ash, Bo  join any Royale lobby someone else hosts and call every round.
//   Sol   hosts a Royale (2 USDC, 3 seats) and runs it as host once someone joins.
//   Rex   captains a rival clan with a 30 USDC chest; accepts any war declared on it and settles wars that are over.
//   Lux   joins the newest clan someone else captains, puts 10 USDC in its chest and votes yes on its proposals.
//   All   have a name and a Stash; now and then one buys a real xStock from its Stash (through Orca) and posts a call
//         about it on the feed, with the live numbers in the text; others reply with their own positions and like
//         posts (the player's too). Keys persist in .localnet/friends so names stay theirs across runs.
//
//   npx tsx scripts/friends.ts            (Ctrl-C to stop; local fork only)
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';
import {
  BN, COINS, FEED_BOARD, IS_LOCAL, LOCAL_ER_VALIDATOR, P, USDC, USDC_MINT, base, baseProgram, er, erProgram, giveUsdc, programFor, sendEr, sha256, sleep, sponsor,
  usdcAta, usdcOf,
} from '../tests/common.ts';
import { STOCKS, createStockAtaIx, minShares, swapAccounts } from '../tests/stocks.ts';

if (!IS_LOCAL) throw new Error('Friends only play on the local fork');
const NO_COIN = 255;
const validatorMeta = [{ pubkey: LOCAL_ER_VALIDATOR, isSigner: false, isWritable: false }];
const pay = { payer: sponsor.publicKey };
const log = (who: string, msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${who.padEnd(4)} ${msg}`);
const err = (who: string, e: unknown) => log(who, `! ${String((e as Error).message ?? e).split('\n')[0].slice(0, 160)}`);

const names = ['Kai', 'Mira', 'Ash', 'Bo', 'Sol', 'Rex', 'Lux'] as const;
type Name = (typeof names)[number];
/** On-chain handles (3+ characters) and clay avatars. */
const HANDLE: Record<Name, [string, number]> = { Kai: ['kai', 0], Mira: ['mira', 8], Ash: ['ash', 3], Bo: ['beau', 11], Sol: ['sol', 6], Rex: ['rex', 5], Lux: ['lux', 4] };
const KEYS = new URL('../.localnet/friends/', import.meta.url);
async function friend(name: Name, usdc = 100) {
  mkdirSync(KEYS, { recursive: true });
  const file = new URL(`${name.toLowerCase()}.json`, KEYS);
  const known = existsSync(file);
  const kp = known ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, 'utf8')))) : Keypair.generate();
  if (!known) writeFileSync(file, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
  const prog = programFor(kp);
  if ((await usdcOf(kp.publicKey)) < 40 * USDC) await giveUsdc(kp.publicKey, usdc * USDC);
  if (!(await base.getAccountInfo(P.player(kp.publicKey)))) await prog.methods.initPlayer().accountsPartial({ owner: kp.publicKey, ...pay }).rpc();
  const [handle, avatar] = HANDLE[name];
  if (!(await base.getAccountInfo(P.profile(kp.publicKey)))) await prog.methods.createProfile(handle, avatar).accountsPartial({ owner: kp.publicKey, ...pay, handle: P.handle(handle) }).rpc();
  if (!(await base.getAccountInfo(P.stash(kp.publicKey)))) await prog.methods.openStash(new BN(0), '').accountsPartial({ owner: kp.publicKey, ...pay, usdcMint: USDC_MINT }).rpc();
  log(name, `@${handle} ${kp.publicKey.toBase58()} · ${(await usdcOf(kp.publicKey)) / USDC} USDC · 0 SOL`);
  return kp;
}
const F: Record<(typeof names)[number], Keypair> = {} as never;
for (const n of names) F[n] = await friend(n);
const isFriend = (pk: PublicKey) => names.some((n) => F[n].publicKey.equals(pk));
// only games opened after the friends came online (nonces are open-time milliseconds): never leftovers from earlier runs
const ONLINE = Date.now();
const cfg = await baseProgram.account.config.fetch(P.config);

/** A duel or tournament from wherever it lives now (the rollup while delegated). */
async function live<T>(kind: 'duel' | 'tournament', key: PublicKey): Promise<{ v: T; onEr: boolean } | null> {
  const b = await baseProgram.provider.connection.getAccountInfo(key);
  if (!b) return null;
  if (b.owner.equals(baseProgram.programId)) return { v: baseProgram.coder.accounts.decode(kind, b.data) as T, onEr: false };
  const e = await er.getAccountInfo(key).catch(() => null);
  // the rollup copy counts once it is the delegated one (owned by the program); a fresh read-only clone is not yet
  return e && e.owner.equals(baseProgram.programId) ? { v: erProgram.coder.accounts.decode(kind, e.data) as T, onEr: true } : null;
}
type Duel = { creator: PublicKey; joiner: PublicKey; nonce: BN; status: number; coin: number; vrfPending: boolean; picksCommitted: number; picksRevealed: number; expiresAt: BN };
type Tour = { creator: PublicKey; nonce: BN; status: number; coin: number; count: number; maxPlayers: number; players: PublicKey[]; lives: number[]; calls: number[]; vrfPending: boolean; roundStartedAt: BN; roundSecs: number; round: number };

/** Sealed pick for a duel this friend plays: commit once rolled, reveal once both committed. */
/** The app opens a perps clash with nonce = open-time ms x 1000 + leverage; a plain clash's nonce is open-time ms (lev 1). */
const clashLev = (nonce: number) => (nonce >= 1e14 ? Math.max(1, Math.min(100, nonce % 1000)) : 1);
type Secret = { side: number; lev: number; salt: Buffer; committed: boolean };

async function playPick(who: string, kp: Keypair, duel: PublicKey, d: Duel, secret: Secret) {
  const prog = programFor(kp);
  const i = d.creator.equals(kp.publicKey) ? 0 : 1;
  if (d.status === 2 && !(d.picksCommitted & (1 << i))) {
    const hash = sha256(duel.toBuffer(), kp.publicKey.toBuffer(), Buffer.from([secret.side]), Buffer.from(new Uint16Array([secret.lev]).buffer), secret.salt);
    await prog.methods.commitPick([...hash]).accountsPartial({ signer: kp.publicKey, duel }).rpc();
    secret.committed = true;
    log(who, `locked a sealed pick on ${duel.toBase58().slice(0, 6)}…`);
  }
  if (d.status === 2 && d.picksCommitted === 0b11 && !(d.picksRevealed & (1 << i))) {
    await prog.methods.revealPick(secret.side, secret.lev, [...secret.salt]).accountsPartial({ signer: kp.publicKey, duel }).rpc();
    log(who, `called ${secret.side === 1 ? 'up' : 'down'}${secret.lev > 1 ? ` at ${secret.lev}x` : ''}`);
  }
}

// ---------------------------------------------------------------- Kai: joins other people's duels
async function kai() {
  const kp = F.Kai;
  const prog = programFor(kp);
  const done = new Set<string>();
  const secrets = new Map<string, Secret>();
  for (;;) {
    try {
      const now = Date.now() / 1000;
      for (const [k, s] of secrets) {
        const duel = new (await import('@solana/web3.js')).PublicKey(k);
        const d = await live<Duel>('duel', duel);
        if (!d || d.v.status >= 3) { secrets.delete(k); continue; }
        await playPick('Kai', kp, duel, d.v, s);
      }
      if (secrets.size === 0) {
        const open = (await baseProgram.account.duel.all()).filter((a) => a.account.status === 0 && Number(a.account.expiresAt) > now
          && Number(a.account.nonce) > ONLINE && !isFriend(a.account.creator) && !done.has(a.publicKey.toBase58()));
        const t = open.sort((a, b) => Number(b.account.nonce) - Number(a.account.nonce))[0];
        if (t) {
          done.add(t.publicKey.toBase58());
          await prog.methods.joinDuel([...sha256(randomBytes(32))]).accountsPartial({ joiner: kp.publicKey, duel: t.publicKey, vault: P.vault(t.publicKey), joinerUsdc: usdcAta(kp.publicKey) }).rpc();
          secrets.set(t.publicKey.toBase58(), { side: Math.random() < 0.5 ? 1 : 2, lev: clashLev(Number(t.account.nonce)), salt: randomBytes(32), committed: false });
          log('Kai', `joined a ${Number(t.account.stake) / USDC} USDC duel from ${t.account.creator.toBase58().slice(0, 4)}…`);
        }
      }
    } catch (e) { err('Kai', e); }
    await sleep(1500);
  }
}

// ---------------------------------------------------------------- Mira: a challenge on the board, run as creator
async function mira() {
  const kp = F.Mira;
  const prog = programFor(kp);
  const erProg = programFor(kp, true);
  let duel: PublicKey | null = null;
  let secret: Secret = { side: 1, lev: 1, salt: randomBytes(32), committed: false };
  let lastCheck = 0;
  for (;;) {
    try {
      if (!duel) {
        const nonce = Date.now();
        duel = P.duel(kp.publicKey, nonce);
        secret = { side: Math.random() < 0.5 ? 1 : 2, lev: 1, salt: randomBytes(32), committed: false };
        // half her challenges are slow one-hour calls on the stocks, half 60 s on crypto
        const stocks = Math.random() < 0.5;
        await prog.methods.openDuel(new BN(nonce), new BN(5 * USDC), stocks ? 0b1111_1000 : 0b111, stocks ? 3600 : 60, new BN(1800), [...sha256(randomBytes(32))])
          .accountsPartial({ creator: kp.publicKey, ...pay, duel, vault: P.vault(duel), creatorUsdc: usdcAta(kp.publicKey), usdcMint: USDC_MINT }).rpc();
        log('Mira', `opened a 5 USDC ${stocks ? 'one-hour stock' : '60 s crypto'} challenge ${duel.toBase58().slice(0, 6)}… on the board`);
      }
      const r = await live<Duel>('duel', duel);
      if (!r) { duel = null; continue; }
      const d = r.v;
      if (d.status === 0 && Number(d.expiresAt) < Date.now() / 1000 + 30) {
        await prog.methods.cancelDuel().accountsPartial({ signer: kp.publicKey, duel, vault: P.vault(duel), creatorUsdc: usdcAta(kp.publicKey), rentPayer: sponsor.publicKey }).rpc();
        log('Mira', 'challenge expiring: cancelled, reopening');
        duel = null;
      } else if (d.status === 1 && !d.vrfPending) {
        await prog.methods.requestCoinRoll([...randomBytes(32)]).accountsPartial({ player: kp.publicKey, ...pay, duel, oracleQueue: cfg.vrfQueue }).rpc();
        log('Mira', `${d.joiner.toBase58().slice(0, 4)}… joined: asked MagicBlock VRF for the coin`);
      } else if (d.status === 2 && !r.onEr) {
        await playPick('Mira', kp, duel, d, secret);
        const again = (await live<Duel>('duel', duel))?.v;
        if (again && again.picksRevealed === 0b11) {
          await prog.methods.delegateDuel(kp.publicKey, new BN(again.nonce)).accountsPartial({ player: kp.publicKey, ...pay, duel }).remainingAccounts(validatorMeta).rpc();
          log('Mira', 'handed the duel to the rollup');
        }
      } else if (d.status === 2 && r.onEr) {
        await sendEr(erProg.methods.startDuel().accountsPartial({ signer: kp.publicKey, duel, price: P.feed(d.coin) }), kp);
        log('Mira', 'started the duel on the rollup');
      } else if (d.status === 3 && r.onEr && Date.now() - lastCheck > 2000) {
        lastCheck = Date.now();
        await sendEr(erProg.methods.checkDuel().accountsPartial({ payer: sponsor.publicKey, duel, price: P.feed(d.coin) })).catch(() => {});
      } else if (d.status === 4 && !r.onEr) {
        await programFor(kp).methods.settleDuel().accountsPartial({ duel, vault: P.vault(duel), creatorUsdc: usdcAta(d.creator), joinerUsdc: usdcAta(d.joiner), creatorPlayer: P.player(d.creator), joinerPlayer: P.player(d.joiner), treasury: cfg.treasury, rentPayer: sponsor.publicKey }).rpc();
        log('Mira', `settled · Mira now ${(await usdcOf(kp.publicKey)) / USDC} USDC`);
      } else if (d.status >= 5) {
        log('Mira', `duel over (${d.status === 5 ? 'settled' : 'cancelled'}); opening a new challenge`);
        duel = null;
      }
    } catch (e) { err('Mira', e); await sleep(1500); }
    await sleep(700);
  }
}

// ---------------------------------------------------------------- Royale: Ash and Bo join, Sol hosts
async function callRound(who: string, kp: Keypair, key: PublicKey, t: Tour) {
  const i = t.players.slice(0, t.count).findIndex((p) => p.equals(kp.publicKey));
  if (i < 0 || t.lives[i] === 0 || t.calls[i] !== 0) return;
  if (Date.now() / 1000 > Number(t.roundStartedAt) + t.roundSecs - 1) return;
  const dir = Math.random() < 0.5 ? 1 : 2;
  await sendEr(programFor(kp, true).methods.callRound(dir).accountsPartial({ player: kp.publicKey, tournament: key }), kp);
  log(who, `round ${t.round}: called ${dir === 1 ? 'up' : 'down'}`);
}
async function resolveIfDue(key: PublicKey, t: Tour) {
  if (t.status !== 1 || Date.now() / 1000 < Number(t.roundStartedAt) + t.roundSecs + 1) return;
  await sendEr(erProgram.methods.resolveRound().accountsPartial({ payer: sponsor.publicKey, tournament: key, price: P.feed(t.coin) })).catch(() => {});
}
async function settleIfDue(who: string, key: PublicKey, t: Tour, onEr: boolean) {
  if (t.status !== 2 || onEr) return;
  await baseProgram.methods.settleTournament().accountsPartial({ tournament: key, vault: P.vault(key), treasury: cfg.treasury, rentPayer: sponsor.publicKey })
    .remainingAccounts(t.players.slice(0, t.count).map((p) => ({ pubkey: usdcAta(p), isSigner: false, isWritable: true })))
    .signers([]).rpc().then(() => log(who, 'settled the Royale on Solana')).catch(() => {});
}
async function joiner(who: 'Ash' | 'Bo') {
  const kp = F[who];
  const prog = programFor(kp);
  const mine = new Set<string>();
  for (;;) {
    try {
      for (const a of await baseProgram.account.tournament.all()) {
        const t = a.account as unknown as Tour;
        if (t.status !== 0 || Number(t.nonce) < ONLINE || isFriend(t.creator) || mine.has(a.publicKey.toBase58()) || t.count >= t.maxPlayers) continue;
        if (t.players.slice(0, t.count).some((p) => p.equals(kp.publicKey))) continue;
        await prog.methods.joinTournament().accountsPartial({ player: kp.publicKey, tournament: a.publicKey, vault: P.vault(a.publicKey), playerUsdc: usdcAta(kp.publicKey) }).rpc();
        mine.add(a.publicKey.toBase58());
        log(who, `joined a Royale hosted by ${t.creator.toBase58().slice(0, 4)}…`);
      }
      for (const k of [...mine]) {
        const key = new (await import('@solana/web3.js')).PublicKey(k);
        const r = await live<Tour>('tournament', key);
        if (!r || r.v.status >= 3) { mine.delete(k); continue; }
        if (r.v.status === 1 && r.onEr) { await callRound(who, kp, key, r.v); await resolveIfDue(key, r.v); }
        await settleIfDue(who, key, r.v, r.onEr);
      }
    } catch (e) { err(who, e); }
    await sleep(1500);
  }
}
async function solHost() {
  const kp = F.Sol;
  const prog = programFor(kp);
  let key: PublicKey | null = null;
  let fullSince = 0;
  for (;;) {
    try {
      if (!key) {
        const nonce = Date.now();
        key = P.tour(kp.publicKey, nonce);
        await prog.methods.createTournament(new BN(nonce), new BN(2 * USDC), 3, NO_COIN, 2, 10, 10).accountsPartial({ creator: kp.publicKey, ...pay, tournament: key, vault: P.vault(key), usdcMint: USDC_MINT }).rpc();
        await prog.methods.joinTournament().accountsPartial({ player: kp.publicKey, tournament: key, vault: P.vault(key), playerUsdc: usdcAta(kp.publicKey) }).rpc();
        await prog.methods.requestTournamentCoin([...randomBytes(32)]).accountsPartial({ creator: kp.publicKey, ...pay, tournament: key, oracleQueue: cfg.vrfQueue }).rpc();
        log('Sol', `hosting a Royale ${key.toBase58().slice(0, 6)}… (2 USDC, 3 seats, 2 lives): join it from the lobby`);
      }
      const r = await live<Tour>('tournament', key);
      if (!r) { key = null; continue; }
      const t = r.v;
      if (t.status === 0 && !r.onEr && t.coin !== NO_COIN && t.count >= 2) {
        fullSince ||= Date.now();
        if (t.count >= t.maxPlayers || Date.now() - fullSince > 20_000) {
          await prog.methods.delegateTournament(kp.publicKey, new BN(t.nonce)).accountsPartial({ host: kp.publicKey, ...pay, tournament: key }).remainingAccounts(validatorMeta).rpc();
          log('Sol', `${t.count} players in: handed the Royale to the rollup`);
        }
      } else if (t.status === 0 && r.onEr) {
        await sendEr(programFor(kp, true).methods.startTournament().accountsPartial({ signer: kp.publicKey, tournament: key, price: P.feed(t.coin) }), kp);
        log('Sol', 'round 1 started on the rollup');
      } else if (t.status === 1 && r.onEr) {
        await callRound('Sol', kp, key, t);
        await resolveIfDue(key, t);
      } else if (t.status === 2) {
        await settleIfDue('Sol', key, t, r.onEr);
      } else if (t.status >= 3) {
        log('Sol', 'Royale over; hosting the next one in 20 s');
        key = null; fullSince = 0;
        await sleep(20_000);
      }
    } catch (e) { err('Sol', e); await sleep(1500); }
    await sleep(800);
  }
}

// ---------------------------------------------------------------- clans: Rex captains a rival clan, Lux joins yours
type Clan = { captain: PublicKey; war: PublicKey; positionsOpen: number; chest: BN; proposals: BN };
type War = { clanA: PublicKey; clanB: PublicKey; nonce: BN; status: number; endTs: BN };
async function rex() {
  const kp = F.Rex;
  const prog = programFor(kp);
  // Rex keeps his key across runs, so he may already captain his clan
  const mine = (await baseProgram.account.player.fetch(P.player(kp.publicKey))).clan;
  let clan: PublicKey;
  if (!mine.equals(PublicKey.default)) {
    clan = mine;
    log('Rex', `captain of clan ${clan.toBase58().slice(0, 6)}…: declare war on it from your clan`);
  } else {
    const name = `rex-crew-${Date.now().toString(36).slice(-3)}`;
    clan = P.clan(name);
    await prog.methods.createClan(name, 4).accountsPartial({ founder: kp.publicKey, ...pay, clan, chest: P.chest(clan), member: P.member(clan, kp.publicKey), usdcMint: USDC_MINT }).rpc();
    await prog.methods.depositChest(new BN(30 * USDC)).accountsPartial({ wallet: kp.publicKey, clan, member: P.member(clan, kp.publicKey), chest: P.chest(clan), walletUsdc: usdcAta(kp.publicKey) }).rpc();
    log('Rex', `captain of "${name}" with a 30 USDC chest: declare war on it from your clan`);
  }
  for (;;) {
    try {
      for (const a of await baseProgram.account.war.all()) {
        const w = a.account as unknown as War;
        if (w.status === 0 && w.clanB.equals(clan)) {
          await prog.methods.acceptWar().accountsPartial({ captain: kp.publicKey, clanA: w.clanA, clanB: clan, chestB: P.chest(clan), war: a.publicKey, vault: P.vault(a.publicKey) }).rpc();
          log('Rex', `accepted the war from ${a.account.clanA.toBase58().slice(0, 4)}…`);
        }
        if (w.status === 1 && (w.clanA.equals(clan) || w.clanB.equals(clan)) && Number(w.endTs) < Date.now() / 1000 - 2) {
          const [ca, cb] = await Promise.all([baseProgram.account.clan.fetch(w.clanA), baseProgram.account.clan.fetch(w.clanB)]) as unknown as Clan[];
          if (ca.positionsOpen === 0 && cb.positionsOpen === 0) {
            await prog.methods.settleWar().accountsPartial({ clanA: w.clanA, clanB: w.clanB, chestA: P.chest(w.clanA), chestB: P.chest(w.clanB), war: a.publicKey, vault: P.vault(a.publicKey), treasury: cfg.treasury, rentPayer: sponsor.publicKey }).rpc();
            log('Rex', 'settled a finished war');
          }
        }
      }
    } catch (e) { err('Rex', e); }
    await sleep(2000);
  }
}

// Lux talks in the clan's #general (on the rollup) once a member has opened it: answers new messages from players
// with the clan's real numbers. Nothing he says is made up.
const DELEGATION = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
let luxSeen = -1;
async function luxSay(clan: PublicKey, text: string) {
  const chan = P.channel(clan, 0);
  const info = await base.getAccountInfo(chan);
  if (!info || !info.owner.equals(DELEGATION)) return;
  await sendEr(programFor(F.Lux, true).methods.postMessage(text.slice(0, 120), 0, PublicKey.default).accountsPartial({ author: F.Lux.publicKey, channel: chan, member: P.member(clan, F.Lux.publicKey) }), F.Lux);
  log('Lux', `said in #general: ${text}`);
}
async function luxChat(clan: PublicKey) {
  const chan = P.channel(clan, 0);
  const info = await base.getAccountInfo(chan);
  if (!info || !info.owner.equals(DELEGATION)) return;
  const c = await erProgram.account.channel.fetch(chan);
  const count = Number(c.count);
  if (luxSeen < 0) { luxSeen = count; if (count === 0) await luxSay(clan, 'gm crew. Lux here, I put 10 USDC in the chest.'); return; }
  for (let k = luxSeen; k < count; k++) {
    const m = c.msgs[k % c.msgs.length];
    if (isFriend(m.author)) continue;
    const said = Buffer.from(m.text.slice(0, m.len)).toString('utf8').toLowerCase();
    const cl = await baseProgram.account.clan.fetch(clan);
    const chest = (Number(cl.chest) / 1e6).toFixed(2);
    const reply = m.kind === 1 ? 'Clash posted. Good luck, tell us how it went.'
      : /\bgm\b|hello|hi\b|hey/.test(said) ? `gm! Chest is at ${chest} USDC.`
      : /chest|vote|trade/.test(said) ? `Chest ${chest} USDC, ${cl.openVotes} vote${cl.openVotes === 1 ? '' : 's'} open. I vote yes on proposals.`
      : `Noted. Chest is at ${chest} USDC.`;
    await sleep(2500);
    await luxSay(clan, reply);
  }
  const after = await erProgram.account.channel.fetch(chan);
  luxSeen = Number(after.count);
}

async function lux() {
  const kp = F.Lux;
  const prog = programFor(kp);
  const was = (await baseProgram.account.player.fetch(P.player(kp.publicKey))).clan;
  let clan: PublicKey | null = was.equals(PublicKey.default) ? null : was;
  const voted = new Set<string>();
  // only clans started after the friends came online (a real player's new clan), never leftovers from earlier runs
  const old = new Set((await baseProgram.account.clan.all()).map((c) => c.publicKey.toBase58()));
  for (;;) {
    try {
      if (!clan) {
        const pick = (await baseProgram.account.clan.all()).find((c) => !old.has(c.publicKey.toBase58())
          && !isFriend((c.account as unknown as Clan).captain) && (c.account as unknown as Clan).war.toBase58() === '11111111111111111111111111111111');
        if (pick) {
          await prog.methods.joinClan().accountsPartial({ wallet: kp.publicKey, ...pay, clan: pick.publicKey, member: P.member(pick.publicKey, kp.publicKey) }).rpc();
          await prog.methods.depositChest(new BN(10 * USDC)).accountsPartial({ wallet: kp.publicKey, clan: pick.publicKey, member: P.member(pick.publicKey, kp.publicKey), chest: P.chest(pick.publicKey), walletUsdc: usdcAta(kp.publicKey) }).rpc();
          clan = pick.publicKey;
          log('Lux', `joined clan ${clan.toBase58().slice(0, 6)}… and put 10 USDC in its chest`);
        }
      } else {
        const props = await baseProgram.account.proposal.all([{ memcmp: { offset: 8, bytes: clan.toBase58() } }]);
        for (const p of props) {
          if (p.account.status !== 0 || voted.has(p.publicKey.toBase58()) || Number(p.account.deadline) < Date.now() / 1000) continue;
          voted.add(p.publicKey.toBase58());
          await prog.methods.vote(true).accountsPartial({ wallet: kp.publicKey, ...pay, clan, member: P.member(clan, kp.publicKey), proposal: p.publicKey, vote: P.vote(p.publicKey, kp.publicKey) }).rpc();
          log('Lux', `voted yes on proposal #${p.account.id}`);
          await luxSay(clan, `Voted yes on proposal #${p.account.id}.`);
        }
      }
      if (clan) await luxChat(clan);
    } catch (e) { err('Lux', e); }
    await sleep(2500);
  }
}


// ---------------------------------------------------------------- everyone: calls, replies and likes on the feed
const NONE = new BN('18446744073709551615');
const COIN_OF = Object.fromEntries(COINS.map((c, i) => [c.symbol, i]));
async function feedPrice(symbol: string) {
  const f = await baseProgram.account.priceFeed.fetch(P.baseFeed(COIN_OF[symbol]));
  return Number(f.price) / 1e6;
}
const pickOf = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
/** What each friend likes to buy. */
const TASTE: Record<Name, string[]> = { Kai: ['NVDA', 'TSLA'], Mira: ['AAPL', 'SPY'], Ash: ['TSLA'], Bo: ['GOOGL', 'NVDA'], Sol: ['SPY'], Rex: ['NVDA', 'GOOGL'], Lux: ['AAPL', 'SPY', 'TSLA'] };
const firstPrice = new Map<string, number>();

/** One friend buys a real xStock from its Stash and posts a call carrying the live numbers. */
async function call(name: Name) {
  const kp = F[name];
  const prog = programFor(kp);
  const sym = pickOf(TASTE[name]);
  const st = STOCKS.find((x) => x.symbol === sym)!;
  const amt = pickOf([5, 5, 10]);
  if ((await usdcOf(kp.publicKey)) < (amt + 5) * USDC) await giveUsdc(kp.publicKey, 50 * USDC);
  const raw = BigInt(amt * USDC);
  await prog.methods.stashInvest(new BN(raw.toString()), new BN((await minShares(base, st, raw)).toString()))
    .accountsPartial({ owner: kp.publicKey, ...pay, holding: P.holding(kp.publicKey, new PublicKey(st.mint)), sw: await swapAccounts(base, kp.publicKey, USDC_MINT, st, true) })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), createStockAtaIx(sponsor.publicKey, kp.publicKey, st),
      await prog.methods.stashSave(new BN(raw.toString()), 0).accountsPartial({ owner: kp.publicKey, ownerUsdc: usdcAta(kp.publicKey) }).instruction()]).rpc();
  const h = await baseProgram.account.holding.fetch(P.holding(kp.publicKey, new PublicKey(st.mint)));
  const px = await feedPrice(sym);
  const first = firstPrice.get(sym) ?? px;
  firstPrice.set(sym, first);
  const move = ((px - first) / first) * 100;
  const total = Number(h.cost) / 1e6;
  const text = pickOf([
    `${st.name} at $${px.toFixed(2)}. Added $${amt}, now $${total.toFixed(0)} in.`,
    `Buying $${amt} more ${sym} at $${px.toFixed(2)}. Slow money.`,
    `${sym} ${move >= 0 ? 'up' : 'down'} ${Math.abs(move).toFixed(2)}% since I started watching. $${amt} more from my Stash.`,
    `Saved it, now investing it: $${amt} of ${sym} at $${px.toFixed(2)}.`,
  ]).slice(0, 140);
  await sendEr(programFor(kp, true).methods.post(text, 1, new PublicKey(st.mint), NONE).accountsPartial({ author: kp.publicKey, board: P.board(FEED_BOARD) }), kp);
  log(name, `bought $${amt} of ${sym} and posted a call`);
}

async function socialLoop() {
  const replied = new Set<number>();
  let nextCall = Date.now() + 5_000;
  for (;;) {
    try {
      const b = await erProgram.account.board.fetch(P.board(FEED_BOARD));
      const posts = b.posts.filter((p) => !p.author.equals(PublicKey.default));
      // likes: friends like recent posts by others (once each, enforced on chain)
      for (const p of posts.slice(-12)) {
        if (Math.random() > 0.35) continue;
        const n = pickOf(names);
        const me = await baseProgram.account.profile.fetch(P.profile(F[n].publicKey));
        if (p.author.equals(F[n].publicKey) || p.liked[me.number >> 3] & (1 << (me.number & 7))) continue;
        await sendEr(programFor(F[n], true).methods.like(p.seq).accountsPartial({ liker: F[n].publicKey, board: P.board(FEED_BOARD) }), F[n]).catch(() => {});
      }
      // replies: someone answers a fresh call with their own position
      const fresh = posts.filter((p) => p.kind === 1 && p.replyTo.toString() === NONE.toString() && !replied.has(Number(p.seq)) && Date.now() / 1000 - Number(p.ts) < 600);
      for (const p of fresh.slice(-2)) {
        replied.add(Number(p.seq));
        if (Math.random() < 0.3) continue;
        const who = pickOf(names.filter((n) => !F[n].publicKey.equals(p.author)));
        const st = STOCKS.find((x) => x.mint === p.refkey.toBase58());
        if (!st) continue;
        const mine = await baseProgram.account.holding.fetchNullable(P.holding(F[who].publicKey, p.refkey));
        const px = await feedPrice(st.symbol);
        const text = mine && Number(mine.shares) > 0
          ? `Same. I hold $${((Number(mine.shares) / 1e8) * px).toFixed(2)} of ${st.symbol}, paid $${(Number(mine.cost) / 1e6).toFixed(2)}.`
          : pickOf([`Not in ${st.symbol} yet. $${px.toFixed(2)} feels high to me.`, `Watching ${st.symbol} at $${px.toFixed(2)}. Might join tomorrow.`]);
        await sendEr(programFor(F[who], true).methods.post(text.slice(0, 140), 0, PublicKey.default, p.seq).accountsPartial({ author: F[who].publicKey, board: P.board(FEED_BOARD) }), F[who]);
        log(who, `replied to post #${p.seq}`);
      }
      if (Date.now() > nextCall) {
        await call(pickOf(names));
        nextCall = Date.now() + 90_000 + Math.random() * 90_000;
      }
    } catch (e) { err('feed', e); }
    await sleep(8000);
  }
}

log('all', 'friends are online');
await Promise.all([kai(), mira(), joiner('Ash'), joiner('Bo'), solHost(), rex(), lux(), socialLoop()]);
