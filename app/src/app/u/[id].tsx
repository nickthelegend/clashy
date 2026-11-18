// Public profile of any player: /u/<their Solana address>. The same ProfileView as your own tab, read-only, with a
// Clash pill instead of Edit profile. Your own address opens your editable profile.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/chain/wallet';
import { ART, BackBtn, Pending, Row } from '@/ui/kit';
import { ProfileView } from '@/ui/profile-view';
import { C, S } from '@/ui/tokens';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const wallet = useWallet();
  const owner = useMemo(() => { try { return id ? new PublicKey(id) : null; } catch { return null; } }, [id]);
  if (!owner)
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: S.gutter }}>
        <Row style={{ marginBottom: 14 }}><BackBtn onPress={back} /></Row>
        <Pending art={ART.emptySearch} title="No player at this address" body={`"${id ?? ''}" is not a Solana address.`} action="Go home" onAction={() => router.replace('/')} />
      </ScrollView>
    );
  const isMe = !!wallet.signer && wallet.signer.publicKey.equals(owner);
  return <ProfileView key={owner.toBase58()} owner={owner} isMe={isMe} onBack={back} />;
}
