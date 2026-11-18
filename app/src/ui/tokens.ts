// Clashy design tokens (v14, Nov 18: the look of the trading apps people already use: OKX Wallet, Phantom, Coinbase,
// Robinhood. Black, white and grey with one accent (lavender); green and red only on numbers; one big number per
// screen, compact rows, logos instead of illustrations. Game colours (C.opp, gold) only inside a live game.)
// v13: Nick's Nov 18 reference, a Phantom-style dark wallet redesign.
// Pure black, no outlined cards, a soft lavender accent with dark text on it, big bold headlines, grey supporting
// text, list rows on hairlines. Type is SF Pro on Apple devices (the system font: it can't be bundled, so it's only
// used where the OS has it) and Inter, its closest open match, everywhere else.
import { Platform, type TextStyle } from 'react-native';

export const C = {
  bg: '#000000',
  s1: '#121214', // a raised surface (sheets, the odd grouped list)
  card: '#0F0F12', // the one card surface: grouped rows, a summary, a chart panel
  s2: '#1E1C25', // chips, icon buttons, secondary buttons, the selected chip
  line: '#1E1E22', // hairlines between rows
  ink: '#F7F7F8',
  muted: '#A0A0AA',
  dim: '#62626C',
  brand: '#AB9FF2', // you, every primary action
  onBrand: '#160F33', // text and icons on the lavender
  brandSoft: '#BDB3F7', // links and secondary accents
  opp: '#F0468C', // the opponent
  up: '#30D158',
  down: '#FF453A',
  upBg: 'rgba(48,209,88,0.14)',
  downBg: 'rgba(255,69,58,0.14)',
  white: '#F7F7F8',
} as const;

/** Inter family names (loaded by app/_layout.tsx): the fallback where SF Pro isn't on the device. */
export const F = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'Inter_700Bold',
  displayB: 'Inter_700Bold',
} as const;

const APPLE_WEB = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"';
type W = '400' | '500' | '600' | '700' | '800';
const face = (inter: string, weight: W): TextStyle => Platform.select<TextStyle>({
  // iOS: the system font is SF Pro, picked by weight
  ios: { fontFamily: 'System', fontWeight: weight },
  // web: SF Pro on Apple devices, the matching Inter weight elsewhere
  web: { fontFamily: `${APPLE_WEB}, ${inter}, Inter, system-ui, sans-serif`, fontWeight: weight },
  // Android: Inter by name (a weight on a custom family can fall back to Roboto)
  default: { fontFamily: inter },
});
/** Spread into a text style: `{ ...FONT.semi, fontSize: 15 }`. */
export const FONT = {
  regular: face(F.regular, '400'),
  medium: face(F.medium, '500'),
  semi: face(F.semi, '600'),
  bold: face(F.bold, '700'),
  display: face(F.bold, '700'),
  displayB: face(F.bold, '800'),
} as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const S = { gutter: 18 } as const;

export const fmtUsd = (n: number, opts: { compact?: boolean } = {}) => {
  if (!Number.isFinite(n)) return '–';
  if (opts.compact) {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  }
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) {
    // tiny meme prices: $0.0₄5282 style is overkill; show 4 significant digits
    return `$${n.toPrecision(4)}`;
  }
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtPct = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
