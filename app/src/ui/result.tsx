// What comes after a settled duel: move part of a win into the Stash (automatically, at the share the player set
// on chain, or with one tap), see where the result put you in your clan, and share it to the calls feed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { BN, FEED_BOARD, NO_REPLY, P, USDC, usdcAta } from '@/chain/client';
import { errText, type useChain } from '@/chain/useChain';
import { readClanServer, readMyClan, readProfile, usePoll, useProfiles } from '@/chain/social';
import { reader } from '@/chain/reads';
import { ProfileAvatar } from './feed';
import { Btn, Card, ErrorLine, Row, Txt } from './kit';
import { C, F, fmtUsd } from './tokens';

type Chain = ReturnType<typeof useChain>;
const RP_WIN = 25;

/** Clan members by rank points, and how many places this win moved you up. */
async function clanStanding(me: PublicKey) {
  const clan = await readMyClan(me);
  if (!clan) return null;
  const server = await readClanServer(clan);
  if (!server) return null;
  const players = await reader.account.player.fetchMultiple(server.members.map((m) => P.player(m)));
  const rows = server.members.map((m, i) => ({ owner: m, rp: players[i]?.rp ?? 0 })).sort((a, b) => b.rp - a.rp);
  const mine = rows.find((r) => r.owner.equals(me));
  if (!mine) return null;
  const now = rows.findIndex((r) => r.owner.equals(me));
  const before = rows.filter((r) => !r.owner.equals(me) && r.rp > mine.rp - RP_WIN).length;
  return { name: server.name, rows, place: now + 1, climbed: Math.max(0, before - now) };
}

export function WinExtras({ chain, duel, winnings }: { chain: Chain; duel: PublicKey; winnings: number }) {
  const { me, progs, onBase, onEr } = chain;
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 15000, [me?.toBase58()]);
  const standing = usePoll(() => (me ? clanStanding(me) : Promise.resolve(null)), 15000, [me?.toBase58(), duel.toBase58()]);
  const profiles = useProfiles();
  const names = profiles.status === 'ready' ? profiles.data : new Map();
  const [saved, setSaved] = useState<number | null>(null);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const flag = `clashy:won-saved:${duel.toBase58()}`;
  const save = async (share: number) => {
    if (!me || !progs) return;
    const amt = Math.floor(winnings * share * USDC);
    if (amt <= 0) return;
    setBusy('save'); setErr(undefined);
    try {
      await onBase(`Save ${(amt / USDC).toFixed(2)} USDC of the win`, () => progs.base.methods.stashSave(new BN(amt), 2).accountsPartial({ owner: me, ownerUsdc: usdcAta(me) }).rpc());
      await AsyncStorage.setItem(flag, String(amt / USDC));
      setSaved(amt / USDC);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  // the player's own setting saves a share of every win automatically, once per duel
  useEffect(() => {
    const p = prof.status === 'ready' ? prof.data : null;
    if (!p || saved !== null) return;
    AsyncStorage.getItem(flag).then((v) => {
      if (v) setSaved(Number(v));
      else if (p.saveBps > 0) save(p.saveBps / 10_000);
    }).catch(() => {});
  }, [prof.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    if (!me || !progs) return;
    setBusy('share'); setErr(undefined);
    try {
      await onEr('Share the win', progs.er.methods.post(`Won a duel: +${winnings.toFixed(2)} USDC.`, 2, duel, NO_REPLY).accountsPartial({ author: me, board: P.board(FEED_BOARD) }));
      setShared(true);
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const st = standing.status === 'ready' ? standing.data : null;
  const p = prof.status === 'ready' ? prof.data : null;
  return (
    <View style={{ alignSelf: 'stretch', marginTop: 12, gap: 10 }}>
      <Card style={{ padding: 12, backgroundColor: '#0D0D10' }}>
        {saved !== null ? (
          <Txt v="label" color={C.up}>Saved {fmtUsd(saved)} to your Stash{p && p.saveBps ? ` (your ${p.saveBps / 100}% setting)` : ''}</Txt>
        ) : (
          <>
            <Txt v="label">Keep some of it</Txt>
            <Txt v="small" style={{ marginTop: 2 }}>Move a quarter, half or all of this win into your Stash, where it can't be staked.</Txt>
            <Row style={{ gap: 8, marginTop: 8 }}>
              {[0.25, 0.5, 1].map((s) => <Btn key={s} title={busy === 'save' ? '…' : fmtUsd(winnings * s)} kind="ghost" h={34} style={{ flex: 1 }} disabled={!!busy} onPress={() => save(s)} />)}
            </Row>
          </>
        )}
      </Card>
      {st ? (
        <Card style={{ padding: 12, backgroundColor: '#0D0D10' }}>
          <Txt v="label">{st.climbed > 0 ? `Up ${st.climbed} spot${st.climbed === 1 ? '' : 's'} in ${st.name}` : `#${st.place} in ${st.name}`}</Txt>
          {st.rows.slice(0, 4).map((r, i) => (
            <Row key={r.owner.toBase58()} style={{ gap: 10, marginTop: 8, backgroundColor: me && r.owner.equals(me) ? 'rgba(91,108,255,0.14)' : 'transparent', borderRadius: 10, padding: 4 }}>
              <Txt v="label" style={{ width: 26, fontFamily: F.bold }}>{i + 1}</Txt>
              <ProfileAvatar p={names.get(r.owner.toBase58())} size={26} />
              <Txt v="label" style={{ flex: 1 }} lines={1}>{names.get(r.owner.toBase58())?.name ?? 'member'}</Txt>
              <Txt v="small">{r.rp} RP</Txt>
            </Row>
          ))}
        </Card>
      ) : null}
      {err ? <ErrorLine msg={err} /> : null}
      <Btn title={shared ? 'Shared to the feed' : busy === 'share' ? 'Sharing…' : 'Share the win to the feed'} kind="ghost" disabled={shared || !!busy} onPress={share} />
    </View>
  );
}

