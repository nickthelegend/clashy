// Profile (last tab): your track record, read from the Clashy program on Solana. Signed out, it explains what the
// profile holds and offers sign-in; the profile itself is the shared ProfileView (also used for /u/<pubkey>).
import { useWallet } from '@/chain/wallet';
import { ProfileSignedOut, ProfileView } from '@/ui/profile-view';

export default function ProfileTab() {
  const wallet = useWallet();
  const me = wallet.signer?.publicKey ?? null;
  if (me) return <ProfileView owner={me} isMe />;
  if (wallet.status === 'setup') return <ProfileSignedOut error={wallet.error ?? 'Setup required'} />;
  if (wallet.status === 'out') return <ProfileSignedOut onSignIn={() => wallet.login?.()} />;
  return <ProfileSignedOut loading />;
}
