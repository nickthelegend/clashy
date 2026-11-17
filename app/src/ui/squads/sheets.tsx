// Squad drawers: start a squad (name + crest, createClan) and a squad's card from Discover (banner, level, members,
// chest, P&L, Join). Both write through the sponsor relay with the player's own wallet signing; errors are shown as
// the program reports them.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { P, USDC_MINT, base } from '@/chain/client';
import { saveSelected, fmtPnl, pnlColor, type SquadRank } from '@/chain/squads';
import type { Profile } from '@/chain/social';
import { errText, short, type useChain } from '@/chain/useChain';
import { Btn, CRESTS, ErrorLine, Row, Txt } from '@/ui/kit';
import { Sheet } from '@/ui/sheet';
import { C, F } from '@/ui/tokens';
import { CARD, GOLD, HAIR, LevelBar, MemberStack, SquadBanner } from './parts';

type Chain = ReturnType<typeof useChain>;

/** Runs a write with its own busy flag and readable error. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setErr(undefined);
    try { await fn(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

/** join_clan and create_clan need the player account; make it first if this wallet has none (sponsored). */
async function ensurePlayer(chain: Chain) {
  const { me, progs, sponsor, onBase } = chain;
  if (!me || !progs || !sponsor) throw new Error("Clashy's payment relay is offline, so nothing can be sent right now. Try again in a minute.");
  if (!(await base.getAccountInfo(P.player(me)))) await onBase('Create player account', () => progs.base.methods.initPlayer().accountsPartial({ owner: me, payer: sponsor }).rpc());
  return { me, progs, sponsor };
}

export function CreateSquadSheet({ open, onClose, chain, onCreated }: { open: boolean; onClose: () => void; chain: Chain; onCreated: (clan: PublicKey) => void }) {
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [crest, setCrest] = useState(0);
  const a = useAction();
  useEffect(() => { if (open) a.setErr(undefined); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // sheet: 18 px padding each side + 1 px border each side, three 10 px gaps
  const cell = Math.floor((Math.min(width, 560) - 38 - 3 * 10) / 4) - 1;
  const bytes = new TextEncoder().encode(name.trim()).length;
  const create = () => a.run(async () => {
    const n = name.trim();
    if (!n) throw new Error('Give your squad a name');
    if (bytes > 24) throw new Error('Squad names are at most 24 bytes');
    const clan = P.clan(n);
    if (await base.getAccountInfo(clan)) throw new Error(`“${n}” is taken on chain`);
    const { me, progs, sponsor } = await ensurePlayer(chain);
    await chain.onBase(`Create squad ${n}`, () => progs.base.methods.createClan(n, crest)
      .accountsPartial({ founder: me, payer: sponsor, clan, chest: P.chest(clan), member: P.member(clan, me), usdcMint: USDC_MINT }).rpc());
    await saveSelected(clan);
    setName('');
    onCreated(clan);
  });
  return (
    <Sheet open={open} onClose={onClose} title="Start a squad">
      <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 12 }}>
        <View style={{ width: 92, height: 92, borderRadius: 28, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={CRESTS[crest]} style={{ width: 80, height: 80 }} contentFit="contain" />
        </View>
        <Txt v="small" style={{ marginTop: 8, textAlign: 'center' }}>You're the captain. A shared USDC chest, two chat channels and squad wars.</Txt>
      </View>
      <Txt v="small" color={C.muted} style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>NAME</Txt>
      <View style={{ height: 52, borderRadius: 16, backgroundColor: '#1C1C23', borderWidth: 1, borderColor: name ? C.brand : HAIR, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. diamond-hands" placeholderTextColor={C.dim} maxLength={24} autoCorrect={false} autoCapitalize="none"
          onSubmitEditing={create} style={{ flex: 1, color: C.ink, fontFamily: F.semi, fontSize: 16, height: 50 }} />
        <Txt v="small" color={bytes > 24 ? C.down : C.dim} style={{ fontVariant: ['tabular-nums'] }}>{bytes}/24</Txt>
      </View>
      <Txt v="small" color={C.muted} style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>CREST</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CRESTS.map((src, i) => (
          <Pressable key={i} onPress={() => setCrest(i)} accessibilityLabel={`Crest ${i + 1}`}
            style={{ width: cell, height: cell, borderRadius: 18, backgroundColor: crest === i ? '#1E2040' : '#1C1C23', borderWidth: 2, borderColor: crest === i ? C.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Image source={src} style={{ width: cell - 16, height: cell - 16 }} contentFit="contain" />
            {crest === i ? <View style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}><Txt v="small" color="#fff" style={{ fontSize: 11, fontFamily: F.bold }}>✓</Txt></View> : null}
          </Pressable>
        ))}
      </View>
      {a.err ? <ErrorLine msg={a.err} /> : null}
      <Btn title={a.busy ? 'Creating on chain…' : 'Create squad'} h={54} style={{ marginTop: 16 }} disabled={a.busy || !name.trim() || bytes > 24} onPress={create} />
      <Txt v="small" style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5 }}>Free: Clashy's relay pays the fee and rent.</Txt>
    </Sheet>
  );
}

const Stat = ({ k, v, color = C.ink }: { k: string; v: string; color?: string }) => (
  <View style={{ flex: 1, backgroundColor: '#1C1C23', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: HAIR }}>
    <Txt v="small" lines={1} style={{ fontSize: 11 }}>{k}</Txt>
    <Txt v="label" lines={1} color={color} style={{ fontSize: 16, marginTop: 2, fontVariant: ['tabular-nums'] }}>{v}</Txt>
  </View>
);

export function SquadSheet({ squad, rank, mine, profiles, chain, onClose, onOpen }: {
  squad: SquadRank | null; rank: number; mine: boolean; profiles: Map<string, Profile>; chain: Chain; onClose: () => void; onOpen: (clan: PublicKey) => void;
}) {
  const a = useAction();
  useEffect(() => { a.setErr(undefined); }, [squad?.key.toBase58()]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = squad;
  const join = () => a.run(async () => {
    if (!s) return;
    if (!chain.me) { chain.wallet.login?.(); return; }
    const { me, progs, sponsor } = await ensurePlayer(chain);
    await chain.onBase(`Join ${s.name}`, () => progs.base.methods.joinClan().accountsPartial({ wallet: me, payer: sponsor, clan: s.key, member: P.member(s.key, me) }).rpc());
    await saveSelected(s.key);
    onOpen(s.key);
  });
  const capt = s ? profiles.get(s.captain.toBase58()) : undefined;
  const names = s ? s.wallets.map((w) => profiles.get(w.toBase58())?.name ?? short(w.toBase58())) : [];
  return (
    <Sheet open={!!s} onClose={onClose}>
      {s ? (
        <View>
          <View style={{ borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR }}>
            <SquadBanner crest={s.crest} height={118} />
            {rank > 0 && rank <= 3 ? (
              <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 9, height: 24, justifyContent: 'center' }}>
                <Txt v="small" color={GOLD} style={{ fontFamily: F.displayB, fontSize: 12 }}>#{rank} SQUAD</Txt>
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 14, paddingTop: 34, paddingBottom: 14 }}>
              <Txt v="title" lines={1} style={{ fontFamily: F.display, fontSize: 26, letterSpacing: -0.4 }}>{s.name}</Txt>
              <Txt v="small" lines={1} style={{ marginTop: 2 }}>{s.members} member{s.members === 1 ? '' : 's'} · captain {capt?.name ? `@${capt.name}` : short(s.captain.toBase58())}{s.atWar ? ' · at war' : ''}</Txt>
              <View style={{ marginTop: 12 }}><LevelBar level={s.level} xp={s.xp} floor={s.levelFloor} next={s.levelNext} /></View>
            </View>
          </View>
          <Row style={{ gap: 8, marginTop: 12 }}>
            <Stat k="Squad P&L" v={fmtPnl(s.pnl)} color={pnlColor(s.pnl, C.up, C.down, C.ink)} />
            <Stat k="Chest" v={`$${s.chest.toFixed(2)}`} />
            <Stat k="Wars" v={`${s.wins}W ${s.losses}L`} />
          </Row>
          <Txt v="small" style={{ marginTop: 8, fontSize: 11.5, lineHeight: 16 }}>
            P&L = chest trades {fmtPnl(s.scorePnl)} + members' stocks {fmtPnl(s.stocksPnl)}{s.priced ? '' : ' (some prices still loading)'}, read from chain.
          </Txt>
          <Row style={{ gap: 12, marginTop: 14, backgroundColor: '#1C1C23', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: HAIR }}>
            <MemberStack profiles={s.wallets.map((w) => profiles.get(w.toBase58()))} total={s.wallets.length} size={30} />
            <Txt v="small" lines={2} style={{ flex: 1, fontSize: 12.5 }} color="#C9C9D1">{names.slice(0, 3).join(', ')}{names.length > 3 ? ` and ${names.length - 3} more` : ''}</Txt>
          </Row>
          {a.err ? <ErrorLine msg={a.err} /> : null}
          {mine
            ? <Btn title="Open squad" h={56} style={{ marginTop: 14 }} onPress={() => onOpen(s.key)} />
            : <Btn title={a.busy ? 'Joining on chain…' : chain.me ? 'Join squad' : 'Sign in to join'} kind="white" h={56} style={{ marginTop: 14 }} disabled={a.busy} onPress={join} />}
          {!mine ? <Txt v="small" style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5 }}>Free to join · you can be in as many squads as you like</Txt> : null}
          <View style={{ height: 4 }} />
        </View>
      ) : <View />}
    </Sheet>
  );
}
