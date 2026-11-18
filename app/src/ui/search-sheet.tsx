// Search as a bottom drawer (Home's search button, ⌘K on the web), laid out like pump.fun's: the box on top, then
// Hot markets / Top players as swipeable cards, what you searched and what you opened recently, and keyboard hints.
// Typing searches players, squads, stocks and every Practice market (perps and memecoins too). Every number is live:
// hot-market sparklines are the prices Clashy's own crank recorded, players and squads are read from chain. Recent
// searches and views are kept on this device only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { readPriceHistory, type PriceHistory } from '@/chain/history-prices';
import { MINT, fmtPrice, useCatalog, type Market } from '@/chain/practice';
import { useClansOnchain, useLeaderboardOnchain, type ClanRow } from '@/chain/reads';
import { isTestAccount, usePoll, useProfiles, type Profile } from '@/chain/social';
import { STOCKS } from '@/chain/stocks';
import { VENUES } from '@/chain/venues';
import { ProfileAvatar, STOCK_ART } from './feed';
import { Search as SearchIcon } from './icons';
import { ART, CRESTS, Row, Sparkline, Txt, rankFor } from './kit';
import { MarketLogo } from './practice-kit';
import { Sheet } from './sheet';
import { C, F } from './tokens';

const HAIR = '#24242B';
const RECENT = 'clashy:search:recent:v1';
const VIEWED = 'clashy:search:viewed:v1';
const crestSrc = (n: number) => CRESTS[((n % CRESTS.length) + CRESTS.length) % CRESTS.length];

/** Something opened from search, remembered for "Recently viewed". */
type Viewed = {
  key: string; href: string; title: string; sub: string; t: number;
  /** How to draw its picture again. */
  pic: { kind: 'player'; owner: string } | { kind: 'squad'; crest: number } | { kind: 'market'; m: Pick<Market, 'kind' | 'icon' | 'stockSym' | 'art' | 'symbol'> };
};

const load = async <T,>(k: string, fallback: T): Promise<T> => { try { const raw = await AsyncStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };
const save = (k: string, v: unknown) => { AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}); };

/** Best match first: exact, starts-with, contains. -1 when it doesn't match. */
const score = (hay: string, q: string) => {
  const h = hay.toLowerCase();
  if (h === q) return 3;
  if (h.startsWith(q)) return 2;
  return h.includes(q) ? 1 : -1;
};

/* ---------- hot markets: the eight markets the crank prices on chain, with what it recorded ---------- */
const COIN_ART: Record<string, 'SOL' | 'BTC' | 'ETH'> = { SOL: 'SOL', BTC: 'BTC', ETH: 'ETH' };
const COIN_NAME: Record<string, string> = { SOL: 'Solana', BTC: 'Bitcoin', ETH: 'Ethereum' };
const COIN_HREF: Record<string, string> = { SOL: `/practice/${MINT.SOL}`, BTC: `/practice/${MINT.CBBTC}`, ETH: `/practice/${MINT.ETH}` };
type Hot = { sym: string; name: string; href: string; series: number[]; last: number; change: number; spanH: number; m: Viewed['pic'] & { kind: 'market' } };
function hotFrom(h: PriceHistory): Hot[] {
  const syms = [...new Set(h.points.flatMap((p) => Object.keys(p.p)))];
  const out: Hot[] = [];
  for (const sym of syms) {
    const pts = h.points.filter((p) => Number.isFinite(p.p[sym]) && p.p[sym] > 0);
    if (pts.length < 2) continue;
    const series = pts.map((p) => p.p[sym]);
    const last = series[series.length - 1];
    const stock = STOCKS.find((s) => s.symbol === sym);
    out.push({
      sym, name: stock?.name ?? COIN_NAME[sym] ?? sym, href: stock ? `/stock/${sym}` : COIN_HREF[sym] ?? `/practice/phoenix-${sym}`,
      series, last, change: (last / series[0] - 1) * 100, spanH: (pts[pts.length - 1].t - pts[0].t) / 3600,
      m: { kind: 'market', m: { kind: stock ? 'stock' : 'crypto', stockSym: stock ? sym : undefined, art: COIN_ART[sym], symbol: sym } },
    });
  }
  // biggest movers first
  return out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 34, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, justifyContent: 'center', borderColor: on ? 'rgba(48,209,88,0.35)' : '#2E2E36', backgroundColor: on ? 'rgba(48,209,88,0.12)' : 'transparent', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Text style={{ fontFamily: F.semi, fontSize: 13.5, color: on ? C.up : C.ink }}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, onClear, children }: { title: string; onClear?: () => void; children: ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Txt v="label" style={{ fontSize: 15 }}>{title}</Txt>
        {onClear ? <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Clear ${title.toLowerCase()}`}><Txt v="small" color={C.dim}>Clear</Txt></Pressable> : null}
      </Row>
      {children}
    </View>
  );
}

function Pic({ pic, names, size = 40 }: { pic: Viewed['pic']; names: Map<string, Profile>; size?: number }) {
  if (pic.kind === 'player') return <ProfileAvatar p={names.get(pic.owner)} size={size} />;
  if (pic.kind === 'squad') return <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#1A1A22', alignItems: 'center', justifyContent: 'center' }}><Image source={crestSrc(pic.crest)} style={{ width: size - 6, height: size - 6 }} contentFit="contain" /></View>;
  return <MarketLogo m={pic.m} size={size} />;
}

function ListRow({ pic, names, title, sub, right, rightSub, rightColor, onPress }: {
  pic: Viewed['pic']; names: Map<string, Profile>; title: string; sub: string; right?: string; rightSub?: string; rightColor?: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 7, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 14, backgroundColor: pressed ? '#1C1C22' : 'transparent' })}>
      <Pic pic={pic} names={names} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1}>{title}</Txt>
        <Txt v="small" lines={1} style={{ marginTop: 1 }}>{sub}</Txt>
      </View>
      {right ? (
        <View style={{ alignItems: 'flex-end', maxWidth: '40%' }}>
          <Txt v="label" lines={1} style={{ fontVariant: ['tabular-nums'] }}>{right}</Txt>
          {rightSub ? <Txt v="small" lines={1} color={rightColor} style={{ fontVariant: ['tabular-nums'] }}>{rightSub}</Txt> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { height: H } = useWindowDimensions();
  return (
    <Sheet open={open} onClose={onClose} height={H * 0.9}>
      {open ? <SearchBody onClose={onClose} minH={H * 0.9 - 70} /> : null}
    </Sheet>
  );
}

function SearchBody({ onClose, minH }: { onClose: () => void; minH: number }) {
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'hot' | 'players'>('hot');
  const [recent, setRecent] = useState<string[]>([]);
  const [viewed, setViewed] = useState<Viewed[]>([]);
  const cards = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const cardX = useRef(0);
  useEffect(() => { load<string[]>(RECENT, []).then(setRecent); load<Viewed[]>(VIEWED, []).then(setViewed); }, []);

  const profiles = useProfiles();
  const board = useLeaderboardOnchain();
  const clans = useClansOnchain();
  const hist = usePoll(() => readPriceHistory('24h'), 60_000);
  const { cat } = useCatalog();
  const names = profiles.status === 'ready' ? profiles.data : new Map<string, Profile>();
  const hot = useMemo(() => (hist.status === 'ready' ? hotFrom(hist.data) : []), [hist]);
  const top = (board.status === 'ready' ? board.data : []).filter((r) => names.has(r.owner.toBase58()) && !isTestAccount(names.get(r.owner.toBase58()))).slice(0, 10);
  const query = q.trim().toLowerCase().replace(/^[@$]/, '');

  // results while typing: players, squads, then markets (stocks and every Practice market)
  type Hit = Omit<Viewed, 't'> & { right?: string; rightSub?: string; rightColor?: string; s: number };
  const hits = useMemo<Hit[]>(() => {
    if (!query) return [];
    const out: Hit[] = [];
    for (const p of names.values()) {
      if (isTestAccount(p) || !p.name) continue;
      const s = Math.max(score(p.name, query), p.owner.toBase58().toLowerCase() === query ? 3 : -1);
      const r = (board.status === 'ready' ? board.data : []).find((x) => x.owner.equals(p.owner));
      if (s >= 0) out.push({ key: `u:${p.owner.toBase58()}`, href: `/u/${p.owner.toBase58()}`, title: p.name, sub: r ? `Player · ${rankFor(r.rp).label} · ${r.wins}W ${r.losses}L` : 'Player', right: r ? `${r.rp} pts` : undefined, pic: { kind: 'player', owner: p.owner.toBase58() }, s: s + 0.3 });
    }
    for (const c of (clans.status === 'ready' ? clans.data : []) as ClanRow[]) {
      if (!c.name || isTestAccount(names.get(c.captain.toBase58()))) continue;
      const s = score(c.name, query);
      if (s >= 0) out.push({ key: `s:${c.key.toBase58()}`, href: `/squad/${c.key.toBase58()}`, title: c.name, sub: `Squad · ${c.members} member${c.members === 1 ? '' : 's'}`, pic: { kind: 'squad', crest: c.crest }, s: s + 0.2 });
    }
    const seen = new Set<string>();
    for (const st of STOCKS) {
      const s = Math.max(score(st.symbol, query), score(st.name, query));
      if (s >= 0) { seen.add(st.symbol); out.push({ key: `k:${st.symbol}`, href: `/stock/${st.symbol}`, title: st.name, sub: `${st.symbol} · tokenized stock`, pic: { kind: 'market', m: { kind: 'stock', stockSym: st.symbol, symbol: st.symbol } }, s: s + 0.1 }); }
    }
    if (cat) {
      for (const m of [...cat.perps, ...cat.crypto, ...cat.memes, ...cat.stocks]) {
        if (m.kind === 'stock' && seen.has(m.symbol)) continue;
        const s = Math.max(score(m.symbol, query), score(m.name, query), m.venueSym ? score(m.venueSym, query) : -1, m.mint === q.trim() ? 3 : -1);
        if (s < 0) continue;
        const where = m.kind === 'perp' ? `${VENUES[m.venue ?? 'jupiter'].name} perp · up to ${m.maxLev}x` : m.kind === 'meme' ? 'pump.fun memecoin' : m.kind === 'stock' ? 'tokenized stock' : 'crypto';
        out.push({ key: `p:${m.id}`, href: `/practice/${m.id}`, title: m.kind === 'perp' ? m.symbol : m.name, sub: `${m.kind === 'perp' ? m.name : m.symbol} · ${where}`, right: m.price !== undefined ? fmtPrice(m.price) : undefined, pic: { kind: 'market', m: { kind: m.kind, icon: m.icon, stockSym: m.stockSym, art: m.art, symbol: m.venueSym ?? m.symbol } }, s });
      }
    }
    return out.sort((a, b) => b.s - a.s).slice(0, 30);
  }, [query, q, names, board, clans, cat]);

  const remember = (h: Omit<Viewed, 't'>) => {
    const v = [{ ...h, t: Date.now() }, ...viewed.filter((x) => x.key !== h.key)].slice(0, 8);
    setViewed(v); save(VIEWED, v);
    if (query) { const r = [q.trim(), ...recent.filter((x) => x.toLowerCase() !== q.trim().toLowerCase())].slice(0, 8); setRecent(r); save(RECENT, r); }
  };
  const open = (h: Omit<Viewed, 't'>) => { remember(h); onClose(); setTimeout(() => router.push(h.href as Href), 240); };
  const step = (dir: 1 | -1) => { cardX.current = Math.max(0, cardX.current + dir * 340); cards.current?.scrollTo({ x: cardX.current, animated: true }); };
  const web = Platform.OS === 'web';
  const hints = web && width >= 560;

  return (
    <View style={{ minHeight: minH }}>
      {/* the box */}
      <Row style={{ gap: 10, height: 52, marginHorizontal: -18, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: HAIR }}>
        <SearchIcon size={18} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search players, squads, stocks and coins…" placeholderTextColor={C.dim}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search"
          onSubmitEditing={() => { if (hits[0]) open(hits[0]); }}
          style={{ flex: 1, minWidth: 0, height: 50, color: C.ink, fontFamily: F.medium, fontSize: 16.5 }} />
        {q ? (
          <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, backgroundColor: pressed ? '#2A2A33' : C.s2, alignItems: 'center', justifyContent: 'center' })}>
            <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: 12 }}>✕</Text>
          </Pressable>
        ) : null}
      </Row>

      {query ? (
        <Animated.View entering={FadeIn.duration(150)} style={{ marginTop: 12 }}>
          {hits.length ? hits.map((h) => (
            <ListRow key={h.key} pic={h.pic} names={names} title={h.title} sub={h.sub} right={h.right} rightSub={h.rightSub} rightColor={h.rightColor} onPress={() => open(h)} />
          )) : (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Image source={ART.emptySearch} style={{ width: 110, height: 110 }} contentFit="contain" />
              <Txt v="label" style={{ marginTop: 6 }}>{profiles.status === 'loading' || !cat ? 'Searching…' : `Nothing called "${q.trim()}"`}</Txt>
              <Txt v="small" style={{ marginTop: 4, textAlign: 'center' }}>Try a player's name, a squad, or a ticker like NVDA, SOL or BONK.</Txt>
            </View>
          )}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(150)}>
          {/* hot markets / top players */}
          <Row style={{ gap: 8, marginTop: 14 }}>
            <Chip label="Hot markets" on={tab === 'hot'} onPress={() => { setTab('hot'); cardX.current = 0; }} />
            <Chip label="Top players" on={tab === 'players'} onPress={() => { setTab('players'); cardX.current = 0; }} />
            <View style={{ flex: 1 }} />
            {web ? (
              <>
                <Pressable onPress={() => step(-1)} accessibilityLabel="Previous" hitSlop={6} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#24242B' : 'transparent' })}><Txt v="label" color={C.muted}>‹</Txt></Pressable>
                <Pressable onPress={() => step(1)} accessibilityLabel="Next" hitSlop={6} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#24242B' : 'transparent' })}><Txt v="label" color={C.muted}>›</Txt></Pressable>
              </>
            ) : null}
          </Row>
          <ScrollView ref={cards as never} horizontal showsHorizontalScrollIndicator={false} onScroll={(e) => { cardX.current = e.nativeEvent.contentOffset.x; }} scrollEventThrottle={64}
            style={{ marginHorizontal: -18, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 10 }}>
            {tab === 'hot' ? (
              hist.status === 'error' ? <View style={{ height: 150, justifyContent: 'center' }}><Txt v="small">{hist.error}</Txt></View>
                : !hot.length ? [0, 1].map((i) => <View key={i} style={{ width: 168, height: 150, borderRadius: 16, backgroundColor: '#1A1A20' }} />)
                  : hot.map((h) => (
                    <Pressable key={h.sym} onPress={() => open({ key: `h:${h.sym}`, href: h.href, title: h.name, sub: h.sym, pic: h.m })} accessibilityRole="button" accessibilityLabel={h.name}
                      style={({ pressed }) => ({ width: 168, borderRadius: 16, backgroundColor: pressed ? '#202027' : '#1A1A20', padding: 12, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                      <Row style={{ gap: 8 }}>
                        <MarketLogo m={h.m.m} size={34} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt v="label" lines={1} style={{ fontSize: 14 }}>{h.name}</Txt>
                          <Txt v="small" lines={1} style={{ fontSize: 11.5 }}>${h.sym}</Txt>
                        </View>
                      </Row>
                      <View style={{ marginTop: 10 }}><Sparkline data={h.series} w={144} h={44} /></View>
                      <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                        <Txt v="label" style={{ fontVariant: ['tabular-nums'] }}>{fmtPrice(h.last)}</Txt>
                        <Txt v="small" color={h.change >= 0 ? C.up : C.down} style={{ fontVariant: ['tabular-nums'] }}>{h.change >= 0 ? '+' : '−'}{Math.abs(h.change).toFixed(2)}%</Txt>
                      </Row>
                      <Txt v="small" style={{ fontSize: 10.5, marginTop: 2 }}>{h.spanH >= 23 ? 'last 24h' : `last ${Math.max(1, Math.round(h.spanH))}h recorded`}</Txt>
                    </Pressable>
                  ))
            ) : !top.length ? (
              <View style={{ height: 150, justifyContent: 'center' }}><Txt v="small">{board.status === 'loading' || profiles.status === 'loading' ? 'Reading the leaderboard…' : 'Win a clash to get on the board.'}</Txt></View>
            ) : top.map((r, i) => {
              const p = names.get(r.owner.toBase58());
              const owner = r.owner.toBase58();
              return (
                <Pressable key={owner} onPress={() => open({ key: `u:${owner}`, href: `/u/${owner}`, title: p?.name ?? 'Player', sub: `${r.rp} pts`, pic: { kind: 'player', owner } })} accessibilityRole="button" accessibilityLabel={p?.name}
                  style={({ pressed }) => ({ width: 140, alignItems: 'center', borderRadius: 16, backgroundColor: pressed ? '#202027' : '#1A1A20', paddingVertical: 14, paddingHorizontal: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                  <Txt v="small" color={i === 0 ? '#FFD66B' : C.muted} style={{ fontFamily: F.semi }}>#{i + 1}</Txt>
                  <View style={{ marginTop: 6 }}><ProfileAvatar p={p} size={52} /></View>
                  <Txt v="label" lines={1} style={{ marginTop: 8, maxWidth: '100%' }}>{p?.name}</Txt>
                  <Txt v="small" lines={1}>{rankFor(r.rp).label} · {r.rp} pts</Txt>
                  <Txt v="small" lines={1} style={{ fontSize: 11.5 }}>{r.wins}W {r.losses}L</Txt>
                </Pressable>
              );
            })}
          </ScrollView>

          <Section title="Recently searched" onClear={recent.length ? () => { setRecent([]); save(RECENT, []); } : undefined}>
            {recent.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recent.map((r) => (
                  <Pressable key={r} onPress={() => setQ(r)} style={({ pressed }) => ({ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: pressed ? '#26262E' : '#1C1C22', justifyContent: 'center' })}>
                    <Txt v="small" color={C.ink}>{r}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : <Txt v="small" color={C.dim} style={{ textAlign: 'center', paddingVertical: 14 }}>No recent searches</Txt>}
          </Section>

          <Section title="Recently viewed" onClear={viewed.length ? () => { setViewed([]); save(VIEWED, []); } : undefined}>
            {viewed.length ? viewed.map((v) => <ListRow key={v.key} pic={v.pic} names={names} title={v.title} sub={v.sub} onPress={() => open(v)} />)
              : <Txt v="small" color={C.dim} style={{ textAlign: 'center', paddingVertical: 14 }}>Players, squads and markets you open from search show up here</Txt>}
          </Section>
        </Animated.View>
      )}

      {hints ? (
        <Row style={{ marginTop: 22, marginHorizontal: -18, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: HAIR, gap: 14 }}>
          <Kbd k="↵" label="to open" /><Kbd k="esc" label="to close" />
          <View style={{ flex: 1 }} />
          <Kbd k="⌘K" />
        </Row>
      ) : null}
    </View>
  );
}

const Kbd = ({ k, label }: { k: string; label?: string }) => (
  <Row style={{ gap: 6 }}>
    <View style={{ minWidth: 26, height: 22, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#34343E', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.muted }}>{k}</Text>
    </View>
    {label ? <Txt v="small" style={{ fontSize: 12 }}>{label}</Txt> : null}
  </Row>
);
