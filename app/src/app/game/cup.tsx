// Daily Cup: one coin of the day for everyone, one scored Draw-the-line run per day, a new cup at 00:00 UTC.
// On chain the coin is a VRF roll at 00:00 UTC and runs are ranked against everyone's, top 20% paid. In practice the
// coin comes from today's date (labelled) and your runs are kept on this device; the ranking needs the program.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAJORS, useMajors } from '@/data/markets';
import { SOCIAL_SETUP } from '@/data/social';
import { Bob, CountUp } from '@/ui/fx';
import { ART, Art, BackBtn, Btn, Card, Pending, Row, TokenArt, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, S, fmtUsd } from '@/ui/tokens';

type Run = { score: number; coin: string; at: number };
const dayKey = (d: Date) => d.toISOString().slice(0, 10); // UTC date
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
const cupCoinFor = (day: string) => MAJORS[hash(day) % MAJORS.length].id;

function untilMidnightUtc(now: number) {
  const d = new Date(now); const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function DailyCup() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(760);
  const majors = useMajors();
  const [now, setNow] = useState(Date.now());
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const today = dayKey(new Date(now));
  const coin = cupCoinFor(today);
  const m = MAJORS.find((x) => x.id === coin)!;
  const live = majors.data?.find((x) => x.id === coin);
  const days = Array.from({ length: 7 }).map((_, i) => dayKey(new Date(now - i * 86400000)));

  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  useEffect(() => {
    AsyncStorage.multiGet(days.map((d) => `clashy:cup:${d}`)).then((rows) => {
      const r: Record<string, Run> = {};
      rows.forEach(([k, v]) => { if (v) try { r[k.slice('clashy:cup:'.length)] = JSON.parse(v) as Run; } catch { /* ignore a bad entry */ } });
      setRuns(r);
    }).catch(() => {});
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = runs[today];
  const streak = (() => { let n = 0; for (const d of days) { if (runs[d]) n++; else break; } return n; })();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 6, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 24 }}>
      <Row style={{ gap: 10, marginBottom: 12 }}>
        <BackBtn onPress={() => router.back()} />
        <View style={{ flex: 1 }}><Txt v="h2">Daily Cup</Txt><Txt v="small">One coin · one run · new cup at 00:00 UTC</Txt></View>
      </Row>

      <Animated.View entering={FadeInDown.springify().damping(14)} style={{ borderRadius: 28, padding: 18, backgroundColor: '#14120A', borderWidth: 1.5, borderColor: 'rgba(255,201,74,0.4)', alignItems: 'center' }}>
        <Bob amp={8} ms={1400}><Art src={ART.tileCup} size={170} radius={0} /></Bob>
        <Txt v="small" style={{ fontFamily: F.semi, letterSpacing: 1, fontSize: 11, marginTop: 6 }}>TODAY'S COIN</Txt>
        <Row style={{ gap: 10, marginTop: 6 }}>
          <TokenArt symbol={coin} uri={m.image} size={36} />
          <Txt v="title">{coin}</Txt>
          <Txt v="body" color={C.muted}>{live ? fmtUsd(live.price) : '…'}</Txt>
        </Row>
        <Txt v="small" style={{ marginTop: 6, textAlign: 'center' }}>Practice: the coin of the day is picked from today's date</Txt>
        <Text style={{ fontFamily: F.bold, fontSize: 30, color: '#FFC94A', marginTop: 12, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{untilMidnightUtc(now)}</Text>
        <Txt v="small">until the next cup</Txt>
        {mine ? (
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <Txt v="small">Your run today</Txt>
            <CountUp to={mine.score} ms={900} format={(v) => `${Math.round(v)}%`} style={{ fontFamily: F.bold, fontSize: 48, letterSpacing: -1.5, color: mine.score >= 70 ? C.up : C.ink }} />
            <Txt v="small">Come back after 00:00 UTC for the next cup</Txt>
          </View>
        ) : (
          <Btn title={`Play today's run · ${coin}`} h={58} style={{ marginTop: 16, alignSelf: 'stretch', borderRadius: 18 }} onPress={() => router.push({ pathname: '/game/line', params: { cup: today, coin } })} />
        )}
      </Animated.View>

      <Row style={{ gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, alignItems: 'center' }}><Txt v="small">Day streak</Txt><Txt v="title">{streak}</Txt></Card>
        <Card style={{ flex: 1, alignItems: 'center' }}><Txt v="small">Best run</Txt><Txt v="title">{Object.values(runs).length ? `${Math.max(...Object.values(runs).map((r) => r.score))}%` : '–'}</Txt></Card>
      </Row>

      <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Your week</Txt>
      <Row style={{ gap: 6 }}>
        {[...days].reverse().map((d) => {
          const r = runs[d];
          return (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: r ? (r.score >= 70 ? C.upBg : C.s1) : C.s1, borderWidth: d === today ? 1.5 : 0, borderColor: '#FFC94A' }}>
              <Txt v="small" style={{ fontSize: 10.5 }}>{new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</Txt>
              <Txt v="label" color={r ? (r.score >= 70 ? C.up : C.ink) : C.dim}>{r ? `${r.score}` : '·'}</Txt>
              <Txt v="small" style={{ fontSize: 10 }}>{cupCoinFor(d)}</Txt>
            </View>
          );
        })}
      </Row>

      <Txt v="h2" style={{ marginTop: 20, marginBottom: 8 }}>Today's ranking</Txt>
      <Pending art={ART.emptyLeaderboard} title="Setup required: cup ranking" body={`Real cups rank your run against everyone's and pay the top 20%, with a full refund under 5 entries. ${SOCIAL_SETUP}`} />
    </ScrollView>
  );
}
