// Base58 (Bitcoin alphabet), enough to read and check Solana addresses without a dependency.
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Map([...ALPHA].map((c, i) => [c, i]));

export function b58decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of s) {
    const v = MAP.get(c);
    if (v === undefined) throw new Error('not base58');
    let carry = v;
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const c of s) { if (c !== '1') break; bytes.push(0); }
  return new Uint8Array(bytes.reverse());
}
export function b58encode(b: Uint8Array): string {
  let z = 0;
  while (z < b.length && b[z] === 0) z++;
  const digits: number[] = [];
  for (let k = z; k < b.length; k++) {
    let carry = b[k];
    for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return '1'.repeat(z) + digits.reverse().map((d) => ALPHA[d]).join('');
}
/** A Solana address: base58 that decodes to exactly 32 bytes. */
export function isWallet(s: unknown): s is string {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try { return b58decode(s).length === 32; } catch { return false; }
}
