// The player's wallet, shared by every on-chain screen. One context, two ways to fill it:
//   - wallet.web.tsx: Privy. Sign in with email or Google and Privy makes a Solana wallet for you. It holds USDC only;
//     the sponsor relay pays every fee and rent, so there is never any SOL to buy.
//   - wallet.tsx (phones) and EXPO_PUBLIC_CLASHY_DEV_WALLET=1: a device-held test key on the local stack.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { deviceSigner, loadWallet, type WalletSigner } from './client';

export type WalletState = {
  /** loading → out (signed out) → creating (Privy is making the wallet) → in; `setup` = a key or app id is missing. */
  status: 'loading' | 'out' | 'creating' | 'in' | 'setup' | 'error';
  signer: WalletSigner | null;
  login?: () => void;
  logout?: () => void;
  /** Privy: show the wallet's private key in Privy's own frame (this app never sees it). */
  exportKey?: () => void;
  /** Privy funding flow (card or exchange) into the wallet as USDC; mainnet builds only. */
  addFunds?: () => void;
  error?: string;
};
export const WalletCtx = createContext<WalletState>({ status: 'loading', signer: null });
export const useWallet = () => useContext(WalletCtx);

/** The device-held test wallet (local stack only). */
export function DeviceWallet({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: 'loading', signer: null });
  useEffect(() => {
    loadWallet().then((kp) => setState({ status: 'in', signer: deviceSigner(kp) })).catch((e) => setState({ status: 'error', signer: null, error: String(e) }));
  }, []);
  return <WalletCtx.Provider value={state}>{children}</WalletCtx.Provider>;
}
