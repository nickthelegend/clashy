// Clashy design tokens (v12: the fomo / pump.fun app look).
// Pure black, flat surfaces, Inter, numbers as the hero.
export const C = {
  bg: '#000000',
  s1: '#111113', // card / input surface
  s2: '#1C1C1F', // chips, icon buttons, secondary buttons
  line: '#1C1C1F',
  ink: '#F5F5F7',
  muted: '#7C7C86',
  dim: '#5A5A64',
  brand: '#5B6CFF', // you, every primary action
  brandSoft: '#AEB6FF',
  opp: '#F0468C', // the opponent
  up: '#30D158',
  down: '#FF453A',
  upBg: 'rgba(48,209,88,0.14)',
  downBg: 'rgba(255,69,58,0.14)',
  white: '#F5F5F7',
} as const;

export const F = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  /** Headlines and big numbers: Inter Bold, the app's one family (the Archivo italic experiment was rolled back). */
  display: 'Inter_700Bold',
  displayB: 'Inter_700Bold',
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
