// Web Crypto on phones (Nov 27). Hermes has neither crypto.getRandomValues (the device test wallet's Keypair.generate
// and every 32-byte random secret) nor crypto.subtle.digest (the sealed pick's SHA-256 commitment). expo-crypto provides
// both from the OS's secure random source and hashing. Loaded by index.js before anything imports @solana/web3.js,
// whose crypto helpers capture globalThis.crypto when they load. The web build keeps the browser's own Web Crypto.
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  const g = globalThis as unknown as { crypto?: Record<string, unknown> };
  const c = (g.crypto ??= {});
  if (typeof c.getRandomValues !== 'function') {
    c.getRandomValues = <T extends ArrayBufferView>(a: T) => ExpoCrypto.getRandomValues(a as unknown as Uint8Array) as unknown as T;
  }
  if (!c.subtle) {
    c.subtle = {
      digest: async (alg: string | { name: string }, data: ArrayBuffer | ArrayBufferView) => {
        const name = typeof alg === 'string' ? alg : alg.name;
        if (name.toUpperCase() !== 'SHA-256') throw new Error(`crypto.subtle.digest: only SHA-256 on phones, not ${name}`);
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
      },
    };
  }
}
