// How Clashy works: a plain-words help center. One section per part of the game (Clash, Royale, Squads, the Stash,
// the Weekly Cup, fees, playing safe, your money), each with its clay art, the key facts and tap-to-open questions.
// The fee rate is read live from the program's config account, and the play-safe section shows your own limit and
// break when you are signed in. Open a section directly with /help?topic=fees (or /help#fees on web).
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { IS_LOCAL_NET, NET, P, PROGRAM_ID, REAL_MONEY } from '@/chain/client';
import { readProfile, reader, usePoll } from '@/chain/social';
import { useWallet } from '@/chain/wallet';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { ClayLoop, type ClayName } from '@/ui/clay';
import { ART, BackBtn, Btn, ErrorLine, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, S, fmtUsd } from '@/ui/tokens';

const CARD = '#111116';
const HAIR = '#1F1F27';

type TopicKey = 'clash' | 'royale' | 'squads' | 'stash' | 'cup' | 'fees' | 'safe' | 'money';
const TOPICS: { key: TopicKey; label: string }[] = [
  { key: 'clash', label: 'Clash' }, { key: 'royale', label: 'Royale' }, { key: 'squads', label: 'Squads' }, { key: 'stash', label: 'Stash' },
  { key: 'cup', label: 'Weekly Cup' }, { key: 'fees', label: 'Fees' }, { key: 'safe', label: 'Play safe' }, { key: 'money', label: 'Your money' },
];
const ALIAS: Record<string, TopicKey> = {
  clash: 'clash', duel: 'clash', royale: 'royale', squads: 'squads', squad: 'squads', stash: 'stash', savings: 'stash', cup: 'cup',
  fees: 'fees', fee: 'fees', safe: 'safe', limits: 'safe', limit: 'safe', responsible: 'safe', break: 'safe', money: 'money', wallet: 'money',
};
const toTopic = (s?: string | string[]) => {
  const v = (Array.isArray(s) ? s[0] : s)?.replace(/^#/, '').toLowerCase();
  return v ? ALIAS[v] ?? null : null;
};

/** The program's fee in basis points, from its config account (set once at launch, readable by anyone). */
async function readRakeBps(): Promise<number> {
  const c = await reader.account.config.fetch(P.config);
  return c.rakeBps;
}
/** Exactly as the program splits a pot: fee = floor(pot × bps / 10 000) in USDC base units. */
const split = (potUsdc: number, bps: number) => {
  const base = Math.round(potUsdc * 1e6);
  const fee = Math.floor((base * bps) / 10_000);
  return { fee: fee / 1e6, rest: (base - fee) / 1e6 };
};
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/* ---------- pieces ---------- */
function Chevron({ color = C.muted }: { color?: string }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function Faq({ q, children, open, onToggle, last }: { q: string; children: ReactNode; open: boolean; onToggle: () => void; last?: boolean }) {
  const rot = useSharedValue(open ? 1 : 0);
  useEffect(() => { rot.value = withTiming(open ? 1 : 0, { duration: 200 }); }, [open, rot]);
  const chev = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 180}deg` }] }));
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={{ borderTopWidth: 1, borderTopColor: HAIR, overflow: 'hidden', borderBottomLeftRadius: last ? 24 : 0, borderBottomRightRadius: last ? 24 : 0 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? '#17171D' : 'transparent' })}>
        <Txt v="label" color={open ? C.ink : '#D6D6DD'} style={{ flex: 1, fontSize: 15, lineHeight: 20 }}>{q}</Txt>
        <Animated.View style={chev}><Chevron color={open ? C.ink : C.muted} /></Animated.View>
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={{ paddingHorizontal: 16, paddingBottom: 16, marginTop: -2 }}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
const A = ({ children }: { children: ReactNode }) => <Txt v="body" color="#B9B9C3" style={{ fontSize: 14.5, lineHeight: 21 }}>{children}</Txt>;
const B = ({ children, color = C.ink }: { children: ReactNode; color?: string }) => <Text style={{ ...FONT.semi, color }}>{children}</Text>;

function Fact({ text, color = C.ink, bg = '#1C1C23' }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 10, height: 30, justifyContent: 'center' }}>
      <Txt v="small" color={color} style={{ ...FONT.bold, fontSize: 12 }}>{text}</Txt>
    </View>
  );
}

type Q = { q: string; a: ReactNode };
function Section({ id, title, lead, loop, still, tint, facts, faqs, focus, extra, onLayout }: {
  id: TopicKey; title: string; lead: string; loop: ClayName; still: number; tint: string; facts: { text: string; color?: string; bg?: string }[];
  faqs: Q[]; focus: boolean; extra?: ReactNode; onLayout: (id: TopicKey, e: LayoutChangeEvent) => void;
}) {
  const [open, setOpen] = useState<number | null>(focus ? 0 : null);
  useEffect(() => { if (focus) setOpen((o) => (o === null ? 0 : o)); }, [focus]);
  return (
    <View onLayout={(e) => onLayout(id, e)} style={{ marginTop: 14 }}>
      {/* the tour lights a section's card as help-<topic> */}
      <TourTarget id={`help-${id}`}>
      <Animated.View entering={FadeInDown.duration(320)} style={{ backgroundColor: CARD, borderRadius: 26, borderWidth: focus ? 1.5 : 1, borderColor: focus ? tint + 'AA' : 'transparent' }}>
        <Row style={{ gap: 14, padding: 16, alignItems: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 22, backgroundColor: tint + '1F', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {focus ? <ClayLoop name={loop} size={84} style={{ backgroundColor: 'transparent' }} /> : <Image source={still} style={{ width: 76, height: 76 }} contentFit="contain" />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="title" color={tint} lines={1} style={{ fontSize: 22, lineHeight: 27, letterSpacing: -0.5 }}>{title}</Txt>
            <Txt v="small" color="#C9C9D1" style={{ marginTop: 4, lineHeight: 18, fontSize: 13 }}>{lead}</Txt>
          </View>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 14, marginTop: -2 }}>
          {facts.map((f) => <Fact key={f.text} {...f} />)}
        </View>
        {extra ? <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>{extra}</View> : null}
        {faqs.map((f, i) => (
          <Faq key={f.q} q={f.q} open={open === i} onToggle={() => setOpen((o) => (o === i ? null : i))} last={i === faqs.length - 1}>{f.a}</Faq>
        ))}
      </Animated.View>
      </TourTarget>
    </View>
  );
}

/** Pot math table for the Fees section, computed with the live rate. */
function PotTable({ bps }: { bps: number }) {
  const rows = [5, 10, 25].map((s) => ({ s, ...split(s * 2, bps) }));
  const cell = { flex: 1, textAlign: 'right' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ backgroundColor: '#17171D', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Row style={{ height: 32 }}>
        {['Stake', 'Pot', 'Fee', 'Winner gets'].map((h, i) => (
          <Txt key={h} v="small" color={C.dim} style={[{ fontSize: 11.5, ...FONT.semi }, i ? cell : { flex: 0.8 }]}>{h}</Txt>
        ))}
      </Row>
      {rows.map((r) => (
        <Row key={r.s} style={{ height: 36, borderTopWidth: 1, borderTopColor: HAIR }}>
          <Txt v="label" style={{ flex: 0.8, fontVariant: ['tabular-nums'] }}>${r.s}</Txt>
          <Txt v="label" color="#C9C9D1" style={cell}>{fmtUsd(r.s * 2)}</Txt>
          <Txt v="label" color={C.muted} style={cell}>{fmtUsd(r.fee)}</Txt>
          <Txt v="label" color={C.up} style={cell}>{fmtUsd(r.rest)}</Txt>
        </Row>
      ))}
    </View>
  );
}

/* ---------- screen ---------- */
export default function Help() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const params = useLocalSearchParams<{ topic?: string }>();
  const wallet = useWallet();
  const me = wallet.signer?.publicKey ?? null;
  const rake = usePoll(readRakeBps, 60_000);
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 10_000, [me?.toBase58()]);

  const hash = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash : '';
  const initial = toTopic(params.topic) ?? toTopic(hash);
  const [focus, setFocus] = useState<TopicKey | null>(initial);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const ys = useRef<Partial<Record<TopicKey, number>>>({});
  const jumped = useRef(false);

  useEffect(() => { const t = toTopic(params.topic); if (t) { setFocus(t); jumped.current = false; } }, [params.topic]);
  const jump = (k: TopicKey) => {
    const y = ys.current[k];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };
  const onLayout = (id: TopicKey, e: LayoutChangeEvent) => {
    ys.current[id] = e.nativeEvent.layout.y;
    if (focus === id && !jumped.current) { jumped.current = true; setTimeout(() => jump(id), 60); }
  };
  const pick = (k: TopicKey) => { setFocus(k); jump(k); };

  const bps = rake.status === 'ready' ? rake.data : null;
  const r = bps ?? 300; // examples use the launch rate until the live one is read
  const rate = bps === null ? '…' : pct(bps);
  const ten = split(20, r);
  const royale = split(2 * 16, r);
  const p = prof.status === 'ready' ? prof.data : null;
  const now = Date.now() / 1000;
  const usedToday = p && p.day === Math.floor(now / 86_400) ? p.stakedToday : 0;
  const onBreak = !!p && p.breakUntil > now;
  const explorer = () => Linking.openURL(`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}${IS_LOCAL_NET ? `?cluster=custom&customUrl=${encodeURIComponent(NET.base)}` : ''}`);
  const ts = useTourScroll(scroll);
  // the Fees card grows a line once the live rate is read, so the tour waits for it
  useScreenTour('help', rake.status !== 'loading');

  return (
    <ScrollView ref={scroll} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
      <TourScroll value={ts.scroller}>
      <Row style={{ gap: 10 }}><BackBtn onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as Href))} /></Row>

      {/* hero */}
      <View style={{ marginTop: 12, borderRadius: 28, overflow: 'hidden', backgroundColor: CARD }}>
        <ClayLoop name="journey" width="100%" height={180} cover />
        <View style={{ padding: 18, paddingTop: 14 }}>
          <Txt v="title" style={{ fontSize: 30, lineHeight: 35, letterSpacing: -1 }}>How Clashy works</Txt>
          <Txt v="body" color="#B9B9C3" style={{ marginTop: 6, lineHeight: 20 }}>Call where a price goes next. Beat a friend 1 v 1, outlast a whole table, team up with a squad, and save what you win. {REAL_MONEY ? 'Real USDC, real rules, no small print.' : 'The public beta is free, on practice money; on-chain duels use test USDC with no value.'}</Txt>
        </View>
      </View>

      {/* topic jump chips */}
      <TourTarget id="help-topics" style={{ marginTop: 14 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter }} contentContainerStyle={{ paddingHorizontal: S.gutter, gap: 8 }}>
        {TOPICS.map((t) => {
          const on = focus === t.key;
          return (
            <Pressable key={t.key} onPress={() => pick(t.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: on ? C.white : pressed ? '#24242C' : C.s2, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <Txt v="label" color={on ? '#000' : C.ink} style={{ fontSize: 13.5 }}>{t.label}</Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      </TourTarget>

      <Section id="clash" focus={focus === 'clash'} onLayout={onLayout} title="Clash" tint={C.opp} loop="duel" still={ART.tileDuel}
        lead="1 v 1. Same coin, two sealed calls. Whoever calls it best takes the pot."
        facts={[{ text: '$5 · $10 · $25' }, { text: 'Stocks · 1 hour', color: '#FFC94A' }, { text: 'Crypto · 60 s', color: C.brandSoft }, { text: 'Ties refund', color: C.up }]}
        faqs={[
          { q: 'How does a clash work?', a: <A>Pick a stake (<B>$5, $10 or $25</B>) and a market: a real stock over <B>1 hour</B> (NVIDIA, Tesla, Apple, the S&P 500 or Alphabet) or crypto over <B>60 seconds</B> (SOL, BTC or ETH). A rival puts in the same stake, the coin is picked at random for both of you, and you each call it up or down. Best call wins the pot.</A> },
          { q: 'Can my rival see my call?', a: <A>No. Your call is sealed until you have both locked in, so nobody can wait and copy you. No leverage either: it is your call against theirs.</A> },
          { q: 'What does the winner get?', a: <A>Both stakes minus the {rate} fee. On a $10 clash the pot is $20 and the winner gets <B color={C.up}>{fmtUsd(ten.rest)}</B> back: their own $10 plus {fmtUsd(ten.rest - 10)}.</A> },
          { q: 'What if it is a tie?', a: <A>You both get your full stake back. No fee is taken on a tie.</A> },
          { q: 'What if nobody joins, or my rival vanishes?', a: <A>An open clash nobody has joined can be cancelled for a full refund, no fee. If a matched clash never gets going, either player can end it after 10 minutes: both stakes come back, unless one player locked in a call and the other never showed it, in which case the one who played wins the pot.</A> },
        ]} />

      <Section id="royale" focus={focus === 'royale'} onLayout={onLayout} title="Royale" tint="#FFC94A" loop="royale" still={ART.tileRoyale}
        lead="A table of up to 16 players. Call each round, lose a heart when you're wrong, last one standing wins."
        facts={[{ text: '$2 entry' }, { text: '2 to 16 seats' }, { text: '1 to 3 hearts', color: C.opp }, { text: '10 s rounds', color: C.brandSoft }]}
        faqs={[
          { q: 'How does a Royale work?', a: <A>Join a table for <B>2 USDC</B>. The host picks the size (2, 4, 8 or 16 seats) and how many hearts everyone starts with (1 to 3). Every round lasts 10 seconds: call up or down, and a wrong call costs you a heart. Run out of hearts and you are out.</A> },
          { q: 'Who wins?', a: <A>The last player standing takes the pot. If the rounds run out with more than one player left, the ones with the most hearts split it. If everyone falls in the same round, the players who were still in before that round share the win.</A> },
          { q: 'How big is the pot?', a: <A>Every entry minus the {rate} fee. A full 16-seat table is $32 in, so <B color={C.up}>{fmtUsd(royale.rest)}</B> goes to whoever is left.</A> },
          { q: 'What if the table never fills?', a: <A>A Royale cancelled before round 1 sends every entry straight back to its player, in full.</A> },
        ]} />

      <Section id="squads" focus={focus === 'squads'} onLayout={onLayout} title="Squads" tint={C.brandSoft} loop="onSquad" still={ART.onSquad}
        lead="Your crew. Chat, pool money in a shared chest, vote on trades and take on other squads."
        facts={[{ text: 'Join as many as you like' }, { text: 'Free to join', color: C.up }, { text: 'Squad wars', color: C.opp }]}
        faqs={[
          { q: 'What is a squad?', a: <A>A group of players with its own chat (#general and #trades), a shared USDC chest and a level that grows with members, chest size and wars won. You can be in <B>as many squads as you like</B>, and starting one is free.</A> },
          { q: 'How does the shared chest work?', a: <A>Members put USDC in and get shares of the chest. The squad trades with it by vote, and votes weigh by shares, so the people with more in have more say. You can cash out your shares at any time; that is also the one thing to do before you leave a squad.</A> },
          { q: 'What is a squad war?', a: <A>Two squads put up a stake from their chests and trade for a set window. The squad with the better return on its chest wins both stakes, minus the {rate} fee, straight into its chest. A tie refunds both sides.</A> },
          { q: 'Who runs the squad?', a: <A>The captain: whoever started it. The captain declares wars; members chat, deposit, vote and clash each other.</A> },
        ]} />

      <Section id="stash" focus={focus === 'stash'} onLayout={onLayout} title="Stash" tint={C.up} loop="stash" still={ART.stash}
        lead="A savings jar only you can open. Save the change, keep part of every win, own real stocks."
        facts={[{ text: 'Only you can open it' }, { text: 'No lockups', color: C.up }, { text: 'Real stocks via Orca', color: '#FFC94A' }]}
        faqs={[
          { q: 'What is the Stash?', a: <A>Your own savings jar, kept apart from the money you play with. Nobody else can take money out of it, Clashy included. Set a goal and watch it fill.</A> },
          { q: 'How do round-ups work?', a: <A>When you pay someone from Clashy, the change up to your round-up step (say, the next $1) goes into your Stash in the same payment. Small amounts, saved without thinking about it.</A> },
          { q: 'Can I save part of my wins?', a: <A>Yes. Pick a share of every win and it moves into your Stash the moment you win.</A> },
          { q: 'Are the stocks real?', a: <A>Yes: real tokenized shares (NVIDIA, Tesla, Apple, the S&P 500, Alphabet) bought and sold through Orca at the pool price, landing in your own wallet. What you paid is kept on record so you always see your real profit. Prices move, so stocks can lose value too.</A> },
          { q: 'Is my money locked?', a: <A>Never. Take money out of the Stash whenever you want, with no lockups and no fees.</A> },
        ]} />

      <Section id="cup" focus={focus === 'cup'} onLayout={onLayout} title="Weekly Cup" tint="#FFD66B" loop="cupBig" still={ART.cupBig}
        lead="Who's calling it best this week. One board for everyone, fresh every Monday."
        facts={[{ text: 'Resets Monday 00:00 UTC' }, { text: 'No entry fee', color: C.up }]}
        faqs={[
          { q: 'How is the Cup scored?', a: <A>Your standing is your profit on stocks bought through the Stash plus what you won in clashes this week. It is all worked out from what happened on chain; nobody types in a score.</A> },
          { q: 'When does it reset?', a: <A>Every Monday at 00:00 UTC. The clash part starts again from zero; your stock profit carries on, since it is the profit on what you hold.</A> },
          { q: 'Do I need to sign up?', a: <A>No. Play a clash or own a stock in the Stash and you are on the board.</A> },
        ]} />

      <Section id="fees" focus={focus === 'fees'} onLayout={onLayout} title="Fees" tint={C.ink} loop="spend" still={ART.spend}
        lead={`One fee, only when a game pays out: ${bps === null ? 'a small cut' : pct(bps)} of the pot. Everything else is free.`}
        facts={[{ text: `${rate} of each pot` }, { text: 'Network fees on us', color: C.up }, { text: 'No deposit or withdraw fees', color: C.up }]}
        extra={(
          <View>
            <PotTable bps={r} />
            {rake.status === 'error' ? <ErrorLine msg={`Showing the launch rate of 3%. ${rake.error}`} onRetry={rake.reload} />
              : <Txt v="small" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 16 }}>{bps === null ? 'Reading the live rate…' : `Rate read live from the Clashy program: ${pct(bps)}. Fees are rounded down to the cent's fraction, in your favour.`}</Txt>}
          </View>
        )}
        faqs={[
          { q: 'What does Clashy charge?', a: <A>{rate} of the pot when a clash, a Royale or a squad war pays out. That is it. Ties, refunds and cancelled games are free.</A> },
          { q: 'Do I pay network fees?', a: <A>Never. Clashy pays every network fee and account cost for you, so your wallet only ever needs USDC. You never have to buy SOL.</A> },
          { q: 'Does it cost anything to add or take out money?', a: <A>No deposit or withdraw fees from Clashy. Sending USDC out, saving to the Stash and taking it back are all free. Buying or selling stocks trades at the Orca pool price, which includes the pool's own small trading fee; Clashy adds nothing on top.</A> },
        ]} />

      <Section id="safe" focus={focus === 'safe'} onLayout={onLayout} title="Play safe" tint={C.brand} loop="limits" still={ART.limits}
        lead={REAL_MONEY ? 'Stakes are real money. Set your own limits, and the rules make sure they hold, even against you.' : 'The beta has no real money: practice money and test USDC only. Limits still work, so set yours, and the rules make sure they hold, even against you.'}
        facts={[{ text: 'Daily limit, enforced on chain' }, { text: 'Lowering is instant', color: C.up }, { text: 'Raising waits 24 h', color: '#FFC94A' }]}
        extra={me ? (
          <View style={{ backgroundColor: '#17171D', borderRadius: 18, padding: 14 }}>
            <Txt v="label" color={C.muted} style={{ fontSize: 13 }}>Your limits</Txt>
            {prof.status === 'loading' ? <Txt v="small" style={{ marginTop: 6 }}>Reading your limits…</Txt>
              : prof.status === 'error' ? <ErrorLine msg={prof.error} onRetry={prof.reload} />
              : !p ? <Txt v="small" style={{ marginTop: 6, lineHeight: 18 }}>Pick a name first: your limits start at $50 a day the moment you join.</Txt> : (
                <>
                  <Row style={{ marginTop: 8, alignItems: 'flex-end' }}>
                    <Txt v="title" style={{ fontSize: 28, fontVariant: ['tabular-nums'] }}>{fmtUsd(p.dailyLimit)}</Txt>
                    <Txt v="small" style={{ marginLeft: 6, marginBottom: 6 }}>a day</Txt>
                    <View style={{ flex: 1 }} />
                    <Txt v="small" style={{ marginBottom: 6 }}>{fmtUsd(usedToday)} used today</Txt>
                  </Row>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: '#24242C', marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, p.dailyLimit ? (usedToday / p.dailyLimit) * 100 : 0)}%`, height: 6, backgroundColor: usedToday >= p.dailyLimit ? C.down : C.brand }} />
                  </View>
                  {p.pendingAt ? <Txt v="small" style={{ marginTop: 8 }}>Raise to {fmtUsd(p.pendingLimit)} applies {new Date(p.pendingAt * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</Txt> : null}
                  <Txt v="small" color={onBreak ? C.up : C.muted} style={{ marginTop: 6 }}>{onBreak ? `On a break until ${new Date(p.breakUntil * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No break set'}</Txt>
                  <Btn title="Change limits in the Stash" kind="ghost" h={44} style={{ marginTop: 12 }} onPress={() => router.push('/stash' as Href)} />
                </>
              )}
          </View>
        ) : undefined}
        faqs={[
          { q: 'How does the daily limit work?', a: <A>It is the most you can put into games in one day (UTC). It starts at <B>$50</B>. The Clashy program checks it on every single stake, so no app, ours included, can go past it.</A> },
          { q: 'Why does raising my limit take 24 hours?', a: <A>So a bad moment cannot turn into a bad day. Lowering your limit applies instantly; raising it only kicks in 24 hours later, and you can still lower it while you wait.</A> },
          { q: 'What is a break?', a: <A>Pick 1, 7 or 30 days with no clashes and no Royales. A break <B>cannot be shortened</B>, only extended, not even by you. Your Stash, savings and stocks stay open the whole time.</A> },
          { q: 'How much should I play with?', a: <A>Only money you can afford to lose. Stakes are real USDC and you can lose them. If it stops being fun, take a break, and talk to someone you trust.</A> },
        ]} />

      <Section id="money" focus={focus === 'money'} onLayout={onLayout} title="Your money" tint="#5AC8FA" loop="onInvest" still={ART.onInvest}
        lead="Your own wallet, your own key. Clashy can't move your money; only the game rules can."
        facts={[{ text: 'Your own wallet' }, { text: 'USDC only', color: '#5AC8FA' }, { text: 'Clashy never sees your key', color: C.up }]}
        faqs={[
          { q: 'Where is my money?', a: <A>In your own wallet on Solana, made for you when you sign in with email or Google. No seed phrase to write down, and it only ever needs USDC.</A> },
          { q: 'What happens to my stake during a game?', a: <A>It waits in the Clashy program's escrow until the game settles, then goes straight to the winner, or back to you on a tie or refund. Nobody can take it out early, Clashy included.</A> },
          { q: 'Can Clashy see or use my key?', a: <A>No. Your key lives with Privy, the wallet provider, and signs inside its own secure window. You can export it any time from Settings and use your wallet anywhere else.</A> },
          { q: 'Can I check all this myself?', a: <A>Yes. Every stake, payout and fee is a public Solana transaction. Your wallet page links each one to Solana Explorer.</A> },
        ]} />

      <TourTarget id="help-chain" style={{ marginTop: 18 }}>
      <Pressable onPress={explorer} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: '#0E0E12', opacity: pressed ? 0.7 : 1 })}>
        <Image source={ART.levelStar} style={{ width: 40, height: 40 }} contentFit="contain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="label">Every rule here runs on chain</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>See the Clashy program on Solana Explorer</Txt>
        </View>
        <Txt v="label" color={C.muted}>›</Txt>
      </Pressable>
      </TourTarget>
      </TourScroll>
    </ScrollView>
  );
}
