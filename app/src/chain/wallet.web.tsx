// Web: Privy. Email or Google sign-in; Privy makes the player's Solana wallet on first login and signs silently inside
// its own frame (the key never reaches this app). The wallet only ever holds USDC: the sponsor relay pays fees and rent.
// EXPO_PUBLIC_CLASHY_DEV_WALLET=1 swaps Privy for a device test key (automated browser tests on the local stack).
import { useEffect, useMemo, type ReactNode } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useExportWallet, useFundWallet, useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { IS_LOCAL_NET, NET, PublicKey, type WalletSigner } from './client';
import { Transaction } from '@solana/web3.js';
import { DeviceWallet, WalletCtx, useWallet, type WalletState } from './walletCore';

export { useWallet };
const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
const DEV = process.env.EXPO_PUBLIC_CLASHY_DEV_WALLET === '1';

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { fundWallet } = useFundWallet();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction } = useSignTransaction();
  // the embedded Solana wallet Privy made for this user, read off the account (never a browser extension's wallet)
  const address = user?.linkedAccounts.find(
    (a) => a.type === 'wallet' && (a as { chainType?: string }).chainType === 'solana' && (a as { walletClientType?: string }).walletClientType === 'privy',
  ) as { address?: string } | undefined;
  const wallet = address?.address ? wallets.find((w) => w.address === address.address) : undefined;

  const state = useMemo<WalletState>(() => {
    if (!ready) return { status: 'loading', signer: null };
    if (!authenticated || !user) return { status: 'out', signer: null, login };
    if (!wallet) return { status: walletsReady ? 'creating' : 'loading', signer: null, logout };
    const signer: WalletSigner = {
      publicKey: new PublicKey(wallet.address),
      kind: 'privy',
      label: user.email?.address ?? user.google?.email ?? 'Privy wallet',
      signTransaction: async (tx) => {
        const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const { signedTransaction } = await signTransaction({ transaction: new Uint8Array(bytes), wallet });
        return Transaction.from(signedTransaction);
      },
      authToken: () => getAccessToken(),
    };
    // buying USDC only makes sense where it is real: the local fork's USDC comes from the faucet instead
    const addFunds = IS_LOCAL_NET ? undefined : () => { fundWallet({ address: wallet.address, options: { chain: 'solana:mainnet', asset: 'USDC' } }).catch(() => {}); };
    return { status: 'in', signer, logout, addFunds, exportKey: () => { exportWallet({ address: wallet.address }).catch(() => {}); } };
  }, [ready, authenticated, user, wallet, walletsReady, login, logout, signTransaction, getAccessToken, exportWallet, fundWallet]);
  return <WalletCtx.Provider value={state}>{children}</WalletCtx.Provider>;
}

function Missing({ children }: { children: ReactNode }) {
  const value: WalletState = { status: 'setup', signer: null, error: 'Setup required: EXPO_PUBLIC_PRIVY_APP_ID (the Clashy app in the Privy dashboard)' };
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function ClashyWallet({ children }: { children: ReactNode }) {
  useEffect(() => { if (DEV) console.info('Clashy: device test wallet (EXPO_PUBLIC_CLASHY_DEV_WALLET=1)'); }, []);
  if (DEV) return <DeviceWallet>{children}</DeviceWallet>;
  if (!APP_ID) return <Missing>{children}</Missing>;
  const ws = NET.base.replace(/^http/, 'ws').replace(/:(\d+)$/, (_, p) => `:${Number(p) + 1}`);
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'all-users' }, showWalletUIs: false },
        appearance: {
          theme: 'dark',
          accentColor: '#5B6CFF',
          walletChainType: 'solana-only',
          landingHeader: 'Sign in to Clashy',
          loginMessage: 'Your Clashy wallet holds USDC. No SOL, no seed phrase: fees are on us.',
        },
        // the cluster this build settles on (the local fork serves mainnet's USDC address)
        solana: { rpcs: { 'solana:mainnet': { rpc: createSolanaRpc(NET.base), rpcSubscriptions: createSolanaRpcSubscriptions(ws) } } },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
