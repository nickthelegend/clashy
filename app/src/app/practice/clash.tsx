// Practice clash: /practice/clash. The real 60-second clash against Clashy Bot, with practice money: pick a coin, a
// mode (classic, or perps at 5x to 50x) and a stake, then call higher or lower. The live price is the rollup price
// feed real clashes settle on; Clashy Bot takes the other side of your call. The stake comes from
// the Practice paper balance; nothing is sent on chain. When you're ready, the result screen sends you to a real clash.
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BOT_NAME, CLASH_SECS, PRACTICE_COINS, PRACTICE_LEVERAGE, PRACTICE_STAKES, botCall, feedFresh, knockout, koPrice, sideReturns, useFeedPrice,
  type Call, type PaperClash, type PracticeCoin,
} from '@/chain/paper-clash';
import { usePractice } from '@/chain/practice';
import { useProfiles, type Profile } from '@/chain/social';
import { errText } from '@/chain/useChain';
import { useWallet } from '@/chain/walletCore';
import { CoinToken, LiveBoard, coinName } from '@/ui/clash';
import { ProfileAvatar } from '@/ui/feed';
import { BackBtn, ErrorLine, LiveChart, LiveDot, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { BarBtn, BotPic, BotTag, PaperBadge } from '@/ui/practice-kit';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/practice' as Href));
const usd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${usd2(Math.abs(n))}`;


/** A segmented control, as in the Clash lobby: the track is the card surface, the selected item white with black text. */
function Chips<T extends string | number>({ items, value, onChange, label }: { items: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, padding: 4, gap: 4 }}>
      {items.map((x) => {
        const on = x === value;
        return (
          <Pressable key={String(x)} onPress={() => { Haptics.selectionAsync(); onChange(x); }} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 14, backgroundColor: on ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Txt v="label" color={on ? '#000' : C.ink} lines={1} style={{ fontSize: 14.5 }}>{label(x)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
/** A dim section label over a control, with an optional note on the right (the Clash lobby's "Stake · 94.70 USDC"). */
function Label({ text, right }: { text: string; right?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 20, marginBottom: 8, gap: 10 }}>
      <Txt v="small" style={{ ...FONT.semi, color: C.dim }}>{text}</Txt>
      {right ? <Txt v="small" lines={1} style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>{right}</Txt> : null}
    </Row>
  );
}

export default function PracticeClash() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { width } = useWindowDimensions();
  const chartW = Math.min(width, 720) - 2 * S.gutter;
  const pr = usePractice();
  const w = useWallet();
  const profiles = useProfiles();
  const me: Profile | undefined = w.signer && profiles.status === 'ready' ? profiles.data.get(w.signer.publicKey.toBase58()) : undefined;

  const live = pr.book?.liveClash ?? null;
  const [coin, setCoin] = useState<PracticeCoin>(live?.coin ?? 'SOL');
  const [lev, setLev] = useState<number>(1);
  const [stake, setStake] = useState<number>(10);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaperClash | null>(null);
  useEffect(() => { if (live) setCoin(live.coin); }, [live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const feed = useFeedPrice(coin);
  const price = feed.last?.price ?? null;

  const history = pr.book?.clashes ?? [];
  const rec = useMemo(() => {
    const done = history.filter((c) => c.result && c.result !== 'abandoned');
    const won = done.filter((c) => c.result === 'won').length, lost = done.filter((c) => c.result === 'lost').length;
    let streak = 0;
    for (const c of done) { if (c.result === 'won') streak++; else if (c.result === 'lost') break; }
    return { won, lost, streak, net: done.reduce((a, c) => a + (c.pnl ?? 0), 0) };
  }, [history]);

  // the round: tick every 250 ms, knock out or ring the bell on a fresh price
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!live) return; const h = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(h); }, [live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const settling = useRef<string | null>(null);
  useEffect(() => {
    if (!live || settling.current === live.id) return;
    const end = (exit: number, ko?: 'you' | 'bot') => {
      settling.current = live.id;
      pr.finishClash(live.id, exit, ko).then((c) => { setResult(c); Haptics.notificationAsync(c.result === 'won' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning); })
        .catch((e) => { settling.current = null; setErr(errText(e)); });
    };
    const f = feed.last;
    // closed through the bell (no price was seen at it): the stake comes back
    if (Date.now() > live.endsAt + 30_000 && (!f || f.at * 1000 < live.endsAt)) {
      settling.current = live.id;
      pr.abandonClash(live.id).then(() => setResult({ ...live, result: 'abandoned', pnl: 0 })).catch(() => { settling.current = null; });
      return;
    }
    if (!f || !feedFresh(f) || f.at * 1000 < live.startedAt) return;
    const ko = knockout(live, f.price);
    if (ko) return end(f.price, ko);
    if (f.at * 1000 >= live.endsAt) end(f.price);
  }, [feed.last, live?.id, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (call: Call) => {
    setErr(undefined); setResult(null);
    const f = feed.last;
    if (!f || !feedFresh(f)) { setErr(`Waiting for a live ${coin} price. The crank pushes one every second; if this lasts, it is stopped.`); return; }
    const bot = botCall(call);
    setBusy(true);
    try {
      const t = Date.now();
      await pr.startClash({ coin, stake, lev, call, botCall: bot.call, botWhy: bot.why, entry: f.price, startedAt: t, endsAt: t + CLASH_SECS * 1000 });
      settling.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const cash = pr.book?.balance ?? 0;
  const left = live ? Math.max(0, (live.endsAt - now) / 1000) : null;
  const since = live ? feed.seen.filter((x) => x.t * 1000 >= live.startedAt - 1000).map((x) => x.p) : [];
  const ret = live && price !== null ? sideReturns(live, price) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
        <Row style={{ gap: 10, marginBottom: 6 }}>
          <BackBtn onPress={back} />
          {live || result ? <Txt v="h2" lines={1} style={{ flex: 1 }}>Practice clash</Txt> : <View style={{ flex: 1 }} />}
          <PaperBadge />
        </Row>

        {live ? (
          /* ---------- the round ---------- */
          <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 18 }}>
            <LiveBoard me={me ?? ({ name: 'You' } as Profile)} rival={{ name: BOT_NAME } as Profile} rivalPic={<BotPic />}
              myPnl={ret ? ret.you * 100 : 0} theirPnl={ret ? ret.bot * 100 : 0} myCall={live.call === 'up' ? 1 : 2} theirCall={live.botCall === 'up' ? 1 : 2}
              sym={live.coin} price={price} entry={live.entry} left={left} onRollup={left !== null && left > 0}
              perps={live.lev > 1 ? { myLev: live.lev, theirLev: live.lev, myKo: false, theirKo: false } : undefined} />
            <View style={{ marginTop: 16, marginHorizontal: -4 }}>
              {price !== null ? (
                <LiveChart data={[live.entry, ...since, price]} w={chartW + 8} h={220} refLine={live.entry} refLabel="start" color={ret && ret.you >= ret.bot ? C.brand : C.opp} />
              ) : <View style={{ height: 220 }} />}
            </View>
            {live.lev > 1 ? (
              <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <Txt v="small">Your knockout <Txt v="small" color={C.down}>{fmtUsd(koPrice(live.entry, live.call, live.lev))}</Txt></Txt>
                <Txt v="small">Bot's <Txt v="small" color={C.down}>{fmtUsd(koPrice(live.entry, live.botCall, live.lev))}</Txt></Txt>
              </Row>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 12, marginTop: 14 }}>
              <BotPic size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ gap: 6 }}><Txt v="label">{BOT_NAME} called {live.botCall === 'up' ? 'higher ▲' : 'lower ▼'}</Txt><BotTag /></Row>
                <Txt v="small" style={{ marginTop: 2, lineHeight: 17 }}>{live.botWhy}</Txt>
              </View>
            </View>
            <Txt v="small" style={{ marginTop: 10, textAlign: 'center' }}>{usd2(live.stake)} of practice money in play · {live.lev > 1 ? `perps ${live.lev}x` : 'classic'} · live {coin} price from the rollup feed</Txt>
            {feed.error ? <ErrorLine msg={feed.error} /> : !feed.fresh && feed.last ? <ErrorLine msg="The price feed has gone quiet. The clash ends on the next live price." /> : null}
            {err ? <ErrorLine msg={err} /> : null}
          </Animated.View>
        ) : result ? (
          /* ---------- the result ---------- */
          <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center', marginTop: 28 }}>
            <Animated.View entering={ZoomIn.springify().damping(11)} style={{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: result.result === 'won' ? C.up : result.result === 'lost' ? C.down : C.s2 }}>
              <Text style={{ ...FONT.bold, fontSize: 42, color: result.result === 'won' ? '#04120A' : '#fff' }}>{result.result === 'won' ? '✓' : result.result === 'lost' ? '✕' : '='}</Text>
            </Animated.View>
            <Txt v="title" style={{ marginTop: 16, fontSize: 28 }}>
              {result.result === 'won' ? (result.ko === 'bot' ? 'Knocked the bot out' : 'You beat the bot') : result.result === 'lost' ? (result.ko === 'you' ? 'Knocked out' : 'The bot won this one') : result.result === 'abandoned' ? 'Clash abandoned' : 'Dead heat'}
            </Txt>
            <Txt v="hero" color={(result.pnl ?? 0) > 0 ? C.up : (result.pnl ?? 0) < 0 ? C.down : C.ink} style={{ fontSize: 50, fontVariant: ['tabular-nums'] }}>{signed(result.pnl ?? 0)}</Txt>
            <Txt v="small" style={{ textAlign: 'center', lineHeight: 19, marginTop: 4 }}>
              {result.result === 'abandoned' ? 'The app was closed through the bell, so there was no price to settle on. Your stake is back.'
                : `${coinName(result.coin)} ${fmtUsd(result.entry)} → ${fmtUsd(result.exit ?? result.entry)} (${(((result.exit ?? result.entry) / result.entry - 1) * 100).toFixed(3)}%). You called ${result.call === 'up' ? 'higher' : 'lower'}, the bot called ${result.botCall === 'up' ? 'higher' : 'lower'}${result.lev > 1 ? ` at ${result.lev}x` : ''}.`}
            </Txt>
            <Txt v="small" style={{ marginTop: 6 }}>Practice money · nothing real moved</Txt>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 24 }}>
              <View style={{ flexDirection: 'row' }}><BarBtn title="Clash the bot again" bg={C.s2} fg={C.ink} onPress={() => setResult(null)} h={52} /></View>
              <View style={{ flexDirection: 'row' }}><BarBtn title={rec.won >= 3 ? "You're ready: clash a real player" : 'Clash a real player'} bg={C.brand} fg={C.onBrand} onPress={() => router.push(`/clash?mode=${result.lev > 1 ? 'perps' : 'crypto'}` as Href)} h={52} /></View>
            </View>
          </Animated.View>
        ) : (
          /* ---------- the lobby ---------- */
          <Animated.View entering={FadeInDown.duration(300)}>
            <Txt v="title" style={{ marginTop: 2 }}>Practice clash</Txt>
            <Txt v="small" style={{ marginTop: 2, lineHeight: 18 }}>The real clash, with practice money. Beat the bot, then clash real players.</Txt>

            {/* you vs the bot: one flat row with the record */}
            <Row style={{ gap: 12, paddingVertical: 10, marginTop: 12 }}>
              <View style={{ width: 66, height: 42 }}>
                <View style={{ position: 'absolute', left: 0, top: 0, borderRadius: 21, borderWidth: 2, borderColor: C.bg }}><ProfileAvatar p={me} size={38} /></View>
                <View style={{ position: 'absolute', left: 26, top: 0, borderRadius: 21, borderWidth: 2, borderColor: C.bg }}><BotPic size={38} /></View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ gap: 6 }}>
                  <Txt v="label" lines={1} style={{ flexShrink: 1 }}>{me?.name ? `@${me.name}` : 'You'} <Txt v="small" color={C.dim}>vs</Txt> {BOT_NAME}</Txt>
                  <BotTag />
                </Row>
                <Txt v="small" lines={1} style={{ marginTop: 1, fontVariant: ['tabular-nums'] }}>
                  {rec.won + rec.lost > 0 ? `${rec.won}–${rec.lost}${rec.streak >= 2 ? ` · ${rec.streak} wins in a row` : ''}` : 'No rounds yet · 60 seconds each'}
                </Txt>
              </View>
              {rec.won + rec.lost > 0 ? <Txt v="num" color={rec.net > 0 ? C.up : rec.net < 0 ? C.down : C.muted}>{signed(rec.net)}</Txt> : null}
            </Row>

            <Label text="Pick a coin" />
            <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 18, padding: 4, gap: 4 }}>
              {PRACTICE_COINS.map((c) => {
                const on = c === coin;
                return (
                  <Pressable key={c} onPress={() => { Haptics.selectionAsync(); setCoin(c); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={coinName(c)}
                    style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.s2 : 'transparent', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                    <CoinToken sym={c} size={24} />
                    <Txt v="label" color={on ? C.ink : C.muted} style={{ fontSize: 14.5 }}>{c}</Txt>
                  </Pressable>
                );
              })}
            </View>
            <Row style={{ gap: 6, marginTop: 12 }}>
              <LiveDot color={feed.fresh ? C.up : C.dim} />
              <Txt v="small" lines={1} style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>{price !== null ? `${coinName(coin)} ${fmtUsd(price)} · ${feed.fresh ? 'live from the rollup feed' : 'feed is quiet'}` : 'Reading the live price'}</Txt>
            </Row>
            <View style={{ marginTop: 8, marginHorizontal: -4 }}>
              {feed.seen.length > 1 ? <LiveChart data={feed.seen.map((x) => x.p)} w={chartW + 8} h={150} color={C.brand} minSpan={0.0006} /> : <View style={{ height: 150 }} />}
            </View>

            <Label text="Mode" />
            <Chips items={PRACTICE_LEVERAGE} value={lev as (typeof PRACTICE_LEVERAGE)[number]} onChange={setLev} label={(x) => (x === 1 ? 'Classic' : `${x}x`)} />
            <Txt v="small" style={{ marginTop: 8, lineHeight: 17 }}>
              {lev === 1 ? 'Classic: the right call after 60 seconds takes the stake.' : `Perps ${lev}x: each side makes ${lev}× the move, up to the stake. A ${(100 / lev).toFixed(lev > 25 ? 1 : 0)}% move against you knocks you out.`}
            </Txt>
            <Label text="Stake" right={`${usd2(cash)} practice money`} />
            <Chips items={PRACTICE_STAKES} value={stake as (typeof PRACTICE_STAKES)[number]} onChange={setStake} label={(x) => `$${x}`} />

            <Txt v="small" style={{ marginTop: 22, textAlign: 'center' }}>Where will {coinName(coin)} be in 60 seconds?</Txt>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <BarBtn title="Higher ▲" bg={C.up} fg="#04120A" onPress={() => start('up')} disabled={busy || !pr.ready || !feed.fresh} h={52} />
              <BarBtn title="Lower ▼" bg={C.down} fg="#fff" onPress={() => start('down')} disabled={busy || !pr.ready || !feed.fresh} h={52} />
            </View>
            {feed.error ? <ErrorLine msg={feed.error} /> : !feed.fresh && feed.last ? <ErrorLine msg={`The ${coin} feed hasn't moved in over 10 s, so a clash can't start. The crank pushes prices every second; it may be stopped.`} /> : null}
            {err ? <ErrorLine msg={err} /> : null}
          </Animated.View>
        )}

        {!live && history.length ? (
          <>
            <Txt v="h2" style={{ marginTop: 28, marginBottom: 4 }}>Your practice clashes</Txt>
            {history.slice(0, 8).map((c) => (
              <Row key={c.id} style={{ gap: 12, paddingVertical: 10 }}>
                <CoinToken sym={c.coin} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="label" lines={1}>{c.result === 'won' ? 'Won' : c.result === 'lost' ? 'Lost' : c.result === 'abandoned' ? 'Abandoned' : 'Dead heat'}{c.ko ? ' · knockout' : ''}</Txt>
                  <Txt v="small" lines={1} style={{ marginTop: 1 }}>{c.coin} · {c.lev > 1 ? `${c.lev}x` : 'classic'} · you {c.call === 'up' ? '▲' : '▼'} bot {c.botCall === 'up' ? '▲' : '▼'}</Txt>
                </View>
                <Txt v="num" color={(c.pnl ?? 0) > 0 ? C.up : (c.pnl ?? 0) < 0 ? C.down : C.muted}>{signed(c.pnl ?? 0)}</Txt>
              </Row>
            ))}
          </>
        ) : null}

        {!live && !result ? (
          <Txt v="small" color={C.dim} style={{ marginTop: 22, fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
            {BOT_NAME} always takes the other side. A finish at the start price is a dead heat.
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}
