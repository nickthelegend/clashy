// Edit profile: your clay avatar (saved on Solana with set_avatar; the sponsor relay pays the fee), your bio and link,
// and a private account switch (people then ask to follow you). Your name is set once on chain and stays yours.
// Bio, link and privacy live on Clashy's social server.
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readProfile, usePoll } from '@/chain/social';
import { social, useSocialProfile } from '@/chain/social-api';
import { errText, useChain } from '@/chain/useChain';
import { TourScroll, TourTarget, useScreenTour, useTourScroll } from '@/tour';
import { ART, AVATARS, BackBtn, Bone, ErrorLine, Pending, Row, Txt } from '@/ui/kit';
import { useDeskColumn } from '@/ui/layout';
import { C, F, FONT, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/profile' as Href));

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const col = useDeskColumn(640);
  const chain = useChain();
  const me = chain.me;
  const prof = usePoll(() => (me ? readProfile(me) : Promise.resolve(null)), 30_000, [me?.toBase58()]);
  const p = prof.status === 'ready' ? prof.data : null;
  const soc = useSocialProfile(me?.toBase58() ?? null, 0);
  const [avatar, setAvatar] = useState<number | null>(null);
  const [bio, setBio] = useState('');
  const [link, setLink] = useState('');
  const [priv, setPriv] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string>();
  const [err, setErr] = useState<string>();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (p && avatar === null) setAvatar(p.avatar); }, [p, avatar]);
  useEffect(() => { if (soc.data && !loaded) { setBio(soc.data.bio); setLink(soc.data.link); setPriv(soc.data.private); setLoaded(true); } }, [soc.data, loaded]);

  const avatarChanged = !!p && avatar !== null && avatar !== p.avatar;
  const socialChanged = loaded && !!soc.data && (bio.trim() !== soc.data.bio || link.trim() !== soc.data.link || priv !== soc.data.private);
  const dirty = avatarChanged || socialChanged;

  const save = async () => {
    if (!me || !p) return;
    setErr(undefined); setSaved(false);
    try {
      if (avatarChanged) {
        if (!chain.progs) throw new Error('The relay is offline; try again in a minute');
        setSaving('Saving your avatar on Solana…');
        await chain.onBase('Change avatar', () => chain.progs!.base.methods.setAvatar(avatar!).accountsPartial({ owner: me }).rpc());
        prof.reload();
      }
      if (socialChanged) {
        setSaving('Saving your bio…');
        await social(chain.wallet.signer, '/v1/me/profile', { method: 'PUT', body: { bio: bio.trim(), link: link.trim(), private: priv } });
        soc.reload();
        setLoaded(false);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (e) { setErr(errText(e)); } finally { setSaving(undefined); }
  };

  const ts = useTourScroll<ComponentRef<typeof ScrollView>>();
  // waits for the avatar (chain) and the bio, link and privacy (social server), or that server's error
  useScreenTour('editprofile', !!me && avatar !== null && (loaded || !!soc.error));

  if (!me) return <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 60, paddingHorizontal: S.gutter }}><Pending art={ART.emptyProfile} title="Sign in to edit your profile" body="Your profile is your avatar, name and track record on Solana." action="Sign in" onAction={() => chain.wallet.login?.()} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView ref={ts.ref} onScroll={ts.onScroll} scrollEventThrottle={16} style={{ flex: 1 }} contentContainerStyle={{ ...col, paddingTop: insets.top + 8, paddingHorizontal: S.gutter, paddingBottom: insets.bottom + 110 }} keyboardShouldPersistTaps="handled">
        <TourScroll value={ts.scroller}>
        <Row style={{ gap: 12, marginBottom: 18 }}>
          <BackBtn onPress={back} />
          <Txt v="h2" style={{ flex: 1 }}>Edit profile</Txt>
        </Row>

        {/* the avatar */}
        <View style={{ alignItems: 'center' }}>
          {avatar === null ? <Bone w={116} h={116} r={58} /> : (
            <Animated.View key={avatar} entering={FadeIn.duration(200)} style={{ padding: 4, borderRadius: 70, borderWidth: 3, borderColor: C.brand }}>
              <Image source={AVATARS[avatar % AVATARS.length]} style={{ width: 116, height: 116, borderRadius: 58, backgroundColor: '#000' }} contentFit="cover" />
            </Animated.View>
          )}
          <Txt v="title" style={{ marginTop: 10, fontSize: 24 }}>{p ? `@${p.name}` : ' '}</Txt>
          <Txt v="small" style={{ marginTop: 2, textAlign: 'center' }}>Your name is set on Solana and stays yours.</Txt>
        </View>

        <Txt v="label" style={{ marginTop: 22, marginBottom: 10 }}>Avatar</Txt>
        <TourTarget id="ep-avatars">
        <View style={{ backgroundColor: '#111116', borderRadius: 24, padding: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
          {AVATARS.map((src, i) => {
            const on = avatar === i;
            return (
              <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Avatar ${i + 1}`} onPress={() => { Haptics.selectionAsync(); setAvatar(i); setSaved(false); }}
                style={({ pressed }) => ({ width: '18.5%', aspectRatio: 1, borderRadius: 999, padding: 2.5, borderWidth: 2.5, borderColor: on ? C.brand : 'transparent', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
                <Image source={src} style={{ width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#000' }} contentFit="cover" />
              </Pressable>
            );
          })}
        </View>
        </TourTarget>
        <Txt v="small" style={{ marginTop: 6 }}>Saved on Solana. Clashy pays the fee.</Txt>

        <Txt v="label" style={{ marginTop: 22, marginBottom: 8 }}>Bio</Txt>
        {soc.error && !soc.data ? <ErrorLine msg={soc.error} onRetry={soc.reload} /> : !loaded ? <Bone w={'100%'} h={92} r={18} /> : (
          <>
            <TourTarget id="ep-bio">
              <Field value={bio} onChange={(t) => { setBio(t); setSaved(false); }} placeholder="Perps degen, SOL maxi, squad captain…" max={160} multiline />
            </TourTarget>
            <Txt v="small" style={{ textAlign: 'right', marginTop: 4, fontSize: 12 }}>{[...bio].length}/160</Txt>
            <Txt v="label" style={{ marginTop: 14, marginBottom: 8 }}>Link</Txt>
            <Field value={link} onChange={(t) => { setLink(t); setSaved(false); }} placeholder="https://x.com/you" max={124} />
            <TourTarget id="ep-private" style={{ marginTop: 18 }}>
            <Row style={{ backgroundColor: '#111116', borderRadius: 20, padding: 14, gap: 12 }}>
              <Image source={ART.limits} style={{ width: 40, height: 40 }} contentFit="contain" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="label">Private account</Txt>
                <Txt v="small" style={{ marginTop: 2, lineHeight: 17 }}>People ask to follow you, and you accept them in Chats. Your track record on chain stays public.</Txt>
              </View>
              <Switch value={priv} onValueChange={(v) => { Haptics.selectionAsync(); setPriv(v); setSaved(false); }} trackColor={{ true: C.brand, false: '#2A2A31' }} thumbColor="#fff" accessibilityLabel="Private account" />
            </Row>
            </TourTarget>
          </>
        )}
        {err ? <ErrorLine msg={err} /> : null}
        </TourScroll>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.94)', borderTopWidth: 1, borderTopColor: '#1F1F27', paddingTop: 12, paddingBottom: insets.bottom + 10, paddingHorizontal: S.gutter }}>
        <View style={col}>
          <TourTarget id="ep-save">
          <Pressable onPress={saved && !dirty ? back : save} disabled={!!saving || (!dirty && !saved)} accessibilityRole="button" accessibilityLabel="Save profile"
            style={({ pressed }) => ({ height: 54, borderRadius: 27, backgroundColor: dirty || saved ? C.brand : '#2A2A31', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Txt v="label" color={dirty || saved ? C.onBrand : C.muted} style={{ fontSize: 16 }}>{saving ?? (saved && !dirty ? 'Saved · Done' : dirty ? 'Save changes' : 'No changes yet')}</Txt>
          </Pressable>
          </TourTarget>
        </View>
      </View>
    </View>
  );
}

function Field({ value, onChange, placeholder, max, multiline }: { value: string; onChange: (s: string) => void; placeholder: string; max: number; multiline?: boolean }) {
  return (
    <View style={{ backgroundColor: '#111116', borderRadius: 18, paddingHorizontal: 14, paddingVertical: multiline ? 10 : 0, minHeight: multiline ? 92 : 52, justifyContent: 'center' }}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.dim} maxLength={max} multiline={multiline} autoCapitalize="none"
        style={{ color: C.ink, fontFamily: F.regular, fontSize: 15.5, lineHeight: 21, ...(multiline ? { minHeight: 70, textAlignVertical: 'top' } : {}), outlineStyle: 'none' } as object} />
    </View>
  );
}
