// Live 1 s price ticks for practice games (Coinbase ticker for majors, DexScreener for Solana tokens).
import { useEffect, useRef, useState } from 'react';
import { fetchLastPrice, isMajor } from './markets';

export type Tick = { t: number; p: number };

/** Polls the latest trade price; keeps the last `keep` ticks. Reports errors instead of inventing prices. */
export function useTicks(id: string, keep = 300) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [error, setError] = useState<string>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setTicks([]);
    const poll = async () => {
      try {
        const p = await fetchLastPrice(id);
        if (!alive.current || !Number.isFinite(p)) return;
        setError(undefined);
        setTicks((t) => [...t.slice(-(keep - 1)), { t: Date.now(), p }]);
      } catch (e) { if (alive.current) setError((e as Error).message); }
    };
    poll();
    const h = setInterval(poll, isMajor(id) ? 1000 : 3000);
    return () => { alive.current = false; clearInterval(h); };
  }, [id, keep]);
  return { ticks, error, last: ticks[ticks.length - 1]?.p };
}
