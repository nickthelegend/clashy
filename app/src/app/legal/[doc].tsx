// Legal: Terms, Privacy and Responsible play for the practice-money public beta, at /legal/terms, /legal/privacy and
// /legal/responsible (the landing's footer links here too). The words live in src/data/legal.ts; this screen lays them
// out in the Help page's column: back, title, the draft notice on top, then plain sections, the contact and the other
// two pages. An unknown page name says so and offers the three real ones.
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTACT, DRAFT_NOTICE, LEGAL, LEGAL_ORDER, UPDATED, isLegalKey, type Block, type LegalKey } from '@/data/legal';
import { BackBtn, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, FONT, S } from '@/ui/tokens';

const CARD = '#111116';
const HAIR = '#1F1F27';
const BODY = '#B9B9C3';
const GOLD = '#FFC94A';

function Para({ text }: { text: string }) {
  return <Txt v="body" color={BODY} style={{ marginTop: 8, fontSize: 15, lineHeight: 22 }}>{text}</Txt>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
          <Txt v="body" color={C.dim} style={{ fontSize: 15, lineHeight: 22 }}>•</Txt>
          <Txt v="body" color={BODY} style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{t}</Txt>
        </View>
      ))}
    </View>
  );
}

const BlockView = ({ b }: { b: Block }) => (typeof b === 'string' ? <Para text={b} /> : <Bullets items={b} />);

/** A tappable row in a rounded card, like a Settings row without the art. */
function LinkRow({ label, sub, onPress, first }: { label: string; sub?: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: pressed ? '#1A1A21' : 'transparent' })}>
      {!first ? <View style={{ position: 'absolute', top: 0, right: 0, left: 14, height: 1, backgroundColor: HAIR }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="label" lines={1} style={{ fontSize: 15 }}>{label}</Txt>
        {sub ? <Txt v="small" lines={1} style={{ marginTop: 2, fontSize: 12 }}>{sub}</Txt> : null}
      </View>
      <Txt v="label" color={C.dim} style={{ fontSize: 18 }}>›</Txt>
    </Pressable>
  );
}

export default function Legal() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(720);
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const key: LegalKey | null = isLegalKey(doc) ? doc : null;
  const page = key ? LEGAL[key] : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const open = (k: LegalKey) => router.push(`/legal/${k}` as Href);
  const mail = () => { Linking.openURL(`mailto:${CONTACT}`).catch(() => {}); };
  const others = LEGAL_ORDER.filter((k) => k !== key);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 40 }}>
      <Stack.Screen options={{ title: page ? `${page.title} · Clashy` : 'Clashy' }} />
      <Row style={{ gap: 12 }}>
        <BackBtn onPress={back} />
        <Txt v="title" lines={1} style={{ flex: 1 }}>{page ? page.title : 'Not found'}</Txt>
      </Row>

      {/* the draft notice, on every page */}
      <View style={{ marginTop: 16, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(255,201,74,0.10)' }}>
        <Txt v="small" color={GOLD} style={{ ...FONT.semi, fontSize: 13, lineHeight: 18 }}>{DRAFT_NOTICE}</Txt>
      </View>

      {page ? (
        <>
          <Txt v="body" color={C.ink} style={{ marginTop: 18, fontSize: 16, lineHeight: 23 }}>{page.lead}</Txt>
          <Txt v="small" style={{ marginTop: 6, fontSize: 12.5 }}>Updated {UPDATED}</Txt>
          {page.sections.map((s) => (
            <View key={s.h} style={{ marginTop: 26 }}>
              <Txt v="h2">{s.h}</Txt>
              {s.body.map((b, i) => <BlockView key={i} b={b} />)}
            </View>
          ))}

          <View style={{ marginTop: 30, backgroundColor: CARD, borderRadius: 22, overflow: 'hidden' }}>
            <LinkRow first label="Questions?" sub={`Write to ${CONTACT}`} onPress={mail} />
          </View>
        </>
      ) : (
        <Txt v="body" color={BODY} style={{ marginTop: 18, lineHeight: 22 }}>There is no page called “{String(doc ?? '')}”. These are the ones we have:</Txt>
      )}

      <Txt v="small" color={C.muted} style={{ ...FONT.bold, fontSize: 11.5, letterSpacing: 1.3, marginTop: 26, marginBottom: 8, marginLeft: 8 }}>{page ? 'MORE' : 'LEGAL'}</Txt>
      <View style={{ backgroundColor: CARD, borderRadius: 22, overflow: 'hidden' }}>
        {others.map((k, i) => <LinkRow key={k} first={i === 0} label={LEGAL[k].title} sub={LEGAL[k].lead} onPress={() => open(k)} />)}
      </View>
    </ScrollView>
  );
}
